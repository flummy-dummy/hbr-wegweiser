<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import WegweiserForm from '$lib/components/WegweiserForm.svelte';
  import WegweiserPreview from '$lib/components/WegweiserPreview.svelte';
  import { normalizeWegweiserData, validateWegweiser, wegweiserStatusOptions } from '$lib/wegweiser';
  import type {
    WegweiserData,
    WegweiserDraftListItem,
    WegweiserFormat,
    WegweiserFormatErrorMap,
    WegweiserOption
  } from '$lib/wegweiser';

  let {
    data
  }: {
    data: {
      drafts: WegweiserDraftListItem[];
      pictogramOptions: WegweiserOption[];
      routeOptions: WegweiserOption[];
      pfostenOptions: Array<{ value: string; label: string }>;
      wegweiserFormats: WegweiserFormat[];
      wegweiserFormatErrors: WegweiserFormatErrorMap;
      editorContext: {
        draftId: string;
        pfostenId: string;
        pfostenKennung: string;
        knotenId: string;
      };
      pocketBaseWarning: string | null;
    };
  } = $props();

  function getEmptyWegweiserData(): WegweiserData {
    return {
      farDestination: '',
      farDistance: '',
      farPictograms: [],
      farRoutePictograms: [],
      nearDestination: '',
      nearDistance: '',
      nearPictograms: [],
      nearRoutePictograms: [],
      formatSlug: 'pfeilwegweiser_rechts',
      direction: 'right',
      routes: []
    };
  }

  function getSuggestedDraftTitle(wegweiser: WegweiserData): string {
    const far = wegweiser.farDestination.trim();
    const near = wegweiser.nearDestination.trim();

    if (far && near) {
      return `${far} - ${near}`;
    }

    return far || near || '';
  }

  const initialWegweiser = getEmptyWegweiserData();

  let wegweiser = $state<WegweiserData>(initialWegweiser);
  let currentDraftId = $state<string | null>(null);
  let selectedDraftId = $state('');
  let isDraftMenuOpen = $state(false);
  let draftSearch = $state('');
  let draftDeleteCandidateId = $state<string | null>(null);
  let isDeletingDraft = $state(false);
  let entwurfTitel = $state('');
  let isDraftTitleManual = $state(false);
  let isSavingDraft = $state(false);
  let saveDraftMessage = $state<string | null>(null);
  let saveDraftError = $state<string | null>(null);
  let loadDraftError = $state<string | null>(null);
  let deleteDraftError = $state<string | null>(null);
  let wegweiserNr = $state('');
  let offizielleWegweiserNr = $state('');
  let katasterWegweiserNr = $state('');
  let pfostenId = $state('');
  let wegweiserStatus = $state('');
  let initialDraftLoaded = $state(false);
  const errors = $derived(validateWegweiser(wegweiser));
  const filteredDrafts = $derived(
    data.drafts.filter((draft) => {
      const search = draftSearch.trim().toLowerCase();

      if (!search) {
        return true;
      }

      return [
        draft.titel,
        draft.wegweiser_nr,
        draft.offizielle_wegweiser_nr,
        draft.kataster_wegweiser_nr
      ].some((value) => (value ?? '').toLowerCase().includes(search));
    })
  );
  const selectedDraft = $derived(data.drafts.find((entry) => entry.id === selectedDraftId) ?? null);
  const selectedPfostenOptionExists = $derived(
    !pfostenId || data.pfostenOptions.some((option) => option.value === pfostenId)
  );
  const returnToPfostenUrl = $derived.by(() => {
    const params = new URLSearchParams();

    if (data.editorContext.pfostenId) {
      params.set('pfostenId', data.editorContext.pfostenId);
    }

    if (data.editorContext.pfostenKennung) {
      params.set('pfosten', data.editorContext.pfostenKennung);
    }

    if (!params.toString()) {
      return '';
    }

    return `/kataster/karte?${params.toString()}`;
  });

  $effect(() => {
    if (currentDraftId || isDraftTitleManual) {
      return;
    }

    entwurfTitel = getSuggestedDraftTitle(wegweiser);
  });

  $effect(() => {
    if (initialDraftLoaded || !data.editorContext.draftId) {
      return;
    }

    const draft = data.drafts.find((entry) => entry.id === data.editorContext.draftId);

    if (!draft) {
      return;
    }

    selectedDraftId = draft.id;
    loadDraft();
    initialDraftLoaded = true;
  });

  function formatDraftUpdated(value: string) {
    if (!value) {
      return 'ohne Zeitangabe';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(date);
  }

  function formatDraftNumberMeta(draft: WegweiserDraftListItem): string {
    const parts = [
      draft.wegweiser_nr || 'keine interne Nr.',
      `Offizielle Nr.: ${draft.offizielle_wegweiser_nr || '-'}`,
      `Kataster: ${draft.kataster_wegweiser_nr || '-'}`
    ];

    return parts.join('  ');
  }

  function loadDraft() {
    saveDraftMessage = null;
    saveDraftError = null;
    loadDraftError = null;
    deleteDraftError = null;

    const draft = data.drafts.find((entry) => entry.id === selectedDraftId);

    if (!draft) {
      return;
    }

    if (!draft.jsonKonfiguration) {
      loadDraftError = 'Der ausgewaehlte Entwurf enthaelt keine gespeicherte Konfiguration.';
      return;
    }

    let parsedConfiguration: unknown;

    if (typeof draft.jsonKonfiguration === 'string') {
      try {
        parsedConfiguration = JSON.parse(draft.jsonKonfiguration);
      } catch (error) {
        console.error('Entwurfs-Konfiguration ist kein gueltiges JSON.', error);
        loadDraftError = 'Die gespeicherte Konfiguration ist ungueltig und konnte nicht geladen werden.';
        return;
      }
    } else if (typeof draft.jsonKonfiguration === 'object') {
      parsedConfiguration = draft.jsonKonfiguration;
    } else {
      loadDraftError = 'Die gespeicherte Konfiguration liegt in einem nicht unterstuetzten Format vor.';
      return;
    }

    const normalized = normalizeWegweiserData(parsedConfiguration, getEmptyWegweiserData());

    wegweiser = normalized.data;
    entwurfTitel = draft.titel;
    wegweiserNr = draft.wegweiser_nr ?? '';
    offizielleWegweiserNr = draft.offizielle_wegweiser_nr ?? '';
    katasterWegweiserNr = draft.kataster_wegweiser_nr ?? '';
    pfostenId = draft.pfosten ?? '';
    wegweiserStatus = draft.status ?? '';
    isDraftTitleManual = true;
    currentDraftId = draft.id;
    isDraftMenuOpen = false;
  }

  function resetToNewDraft() {
    wegweiser = getEmptyWegweiserData();
    entwurfTitel = '';
    wegweiserNr = '';
    offizielleWegweiserNr = '';
    katasterWegweiserNr = '';
    pfostenId = '';
    wegweiserStatus = '';
    isDraftTitleManual = false;
    currentDraftId = null;
    selectedDraftId = '';
    draftSearch = '';
    draftDeleteCandidateId = null;
    isDraftMenuOpen = false;
    saveDraftMessage = null;
    saveDraftError = null;
    loadDraftError = null;
    deleteDraftError = null;
  }

  function toggleDraftMenu() {
    isDraftMenuOpen = !isDraftMenuOpen;
    draftDeleteCandidateId = null;
    if (!isDraftMenuOpen) {
      draftSearch = '';
    }
  }

  function selectDraft(id: string) {
    selectedDraftId = id;
    draftDeleteCandidateId = null;
  }

  async function deleteDraft(id: string) {
    deleteDraftError = null;
    isDeletingDraft = true;

    try {
      const response = await fetch(`/api/entwuerfe/${id}`, {
        method: 'DELETE'
      });

      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        deleteDraftError = result.message ?? 'Der Entwurf konnte nicht geloescht werden.';
        return;
      }

      if (currentDraftId === id) {
        resetToNewDraft();
      } else if (selectedDraftId === id) {
        selectedDraftId = '';
      }

      draftDeleteCandidateId = null;
      await invalidateAll();
    } catch (error) {
      console.error('Entwurf konnte nicht geloescht werden.', error);
      deleteDraftError = 'Der Entwurf konnte nicht geloescht werden.';
    } finally {
      isDeletingDraft = false;
    }
  }

  async function saveDraft(forceNew = false) {
    saveDraftMessage = null;
    saveDraftError = null;

    if (errors.form || errors.farDistance || errors.nearDistance) {
      saveDraftError = 'Bitte korrigiere zuerst die Eingaben im Formular.';
      return;
    }

    isSavingDraft = true;

    try {
      const isUpdate = Boolean(currentDraftId && !forceNew);
      const endpoint = isUpdate ? `/api/entwuerfe/${currentDraftId}` : '/api/entwuerfe';
      const method = isUpdate ? 'PATCH' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          titel: entwurfTitel,
          wegweiser,
          wegweiser_nr: wegweiserNr,
          offizielle_wegweiser_nr: offizielleWegweiserNr,
          kataster_wegweiser_nr: katasterWegweiserNr,
          pfosten: pfostenId,
          status: wegweiserStatus
        })
      });

      const result = (await response.json()) as { id?: string; message?: string };

      if (!response.ok) {
        saveDraftError = result.message ?? 'Der Entwurf konnte nicht gespeichert werden.';
        return;
      }

      await invalidateAll();

      if (!isUpdate && result.id) {
        currentDraftId = result.id;
        selectedDraftId = result.id;
      }

      saveDraftMessage = result.message ?? 'Entwurf wurde gespeichert.';
    } catch (error) {
      console.error('Entwurf konnte nicht gespeichert werden.', error);
      saveDraftError = 'Der Entwurf konnte nicht gespeichert werden.';
    } finally {
      isSavingDraft = false;
    }
  }
</script>

<svelte:head>
  <title>Editor Test | HBR-Wegweiser-Generator</title>
</svelte:head>

<main class="page editor-page">
  <header class="editor-header">
    <a href="/">Startseite</a>
    {#if returnToPfostenUrl}
      <a class="button secondary-button button-small" href={returnToPfostenUrl}>
        ← Zurueck zum Pfosten
      </a>
    {/if}
    <h1>Editor-Test</h1>
    <p>Erster fachlicher MVP für einen HBR-Pfeilwegweiser.</p>
    {#if data.pocketBaseWarning}
      <p class="form-error">{data.pocketBaseWarning}</p>
    {/if}
  </header>

  <section class="editor-grid" aria-label="Editor-Arbeitsbereich">
    <div class="panel">
      <p class="eyebrow">Formular</p>
      <h2>Eingaben</h2>
      <div class="draft-load-panel">
        <label>
          <span>Entwurf laden</span>
          <div class="draft-picker">
            <button
              aria-expanded={isDraftMenuOpen}
              class="draft-picker-toggle"
              type="button"
              onclick={toggleDraftMenu}
            >
              <span>
                {#if selectedDraft}
                  {selectedDraft.titel} - {formatDraftUpdated(selectedDraft.updated)}
                {:else}
                  Entwurf auswaehlen
                {/if}
              </span>
              <span class="draft-picker-chevron">▾</span>
            </button>

            {#if isDraftMenuOpen}
              <div class="draft-picker-menu">
                <input
                  bind:value={draftSearch}
                  class="draft-picker-search"
                  placeholder="Entwurf suchen"
                  type="search"
                />

                <div class="draft-picker-list">
                  {#if filteredDrafts.length}
                    {#each filteredDrafts as draft}
                      <div class="draft-picker-item">
                        <button
                          class:draft-picker-item-active={selectedDraftId === draft.id}
                          class="draft-picker-select"
                          type="button"
                          onclick={() => selectDraft(draft.id)}
                        >
                          <strong>{draft.titel}</strong>
                          <small>{formatDraftNumberMeta(draft)}</small>
                          <small>{formatDraftUpdated(draft.updated)}</small>
                        </button>
                        <button
                          aria-label={`${draft.titel} loeschen`}
                          class="draft-delete-trigger"
                          type="button"
                          onclick={(event) => {
                            event.stopPropagation();
                            draftDeleteCandidateId = draftDeleteCandidateId === draft.id ? null : draft.id;
                          }}
                        >
                          ×
                        </button>

                        {#if draftDeleteCandidateId === draft.id}
                          <div class="draft-delete-confirm">
                            <p>Entwurf wirklich loeschen?</p>
                            <div class="draft-delete-confirm-actions">
                              <button
                                type="button"
                                onclick={(event) => {
                                  event.stopPropagation();
                                  draftDeleteCandidateId = null;
                                }}
                              >
                                Abbrechen
                              </button>
                              <button
                                disabled={isDeletingDraft}
                                type="button"
                                onclick={(event) => {
                                  event.stopPropagation();
                                  void deleteDraft(draft.id);
                                }}
                              >
                                OK
                              </button>
                            </div>
                          </div>
                        {/if}
                      </div>
                    {/each}
                  {:else}
                    <p class="draft-picker-empty">Keine passenden Entwuerfe gefunden.</p>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        </label>
        <button
          class="button draft-load-button"
          disabled={!selectedDraftId}
          type="button"
          onclick={loadDraft}
        >
          Entwurf laden
        </button>
      </div>
      {#if loadDraftError}
        <p class="form-error">{loadDraftError}</p>
      {/if}
      {#if deleteDraftError}
        <p class="form-error">{deleteDraftError}</p>
      {/if}
      {#if selectedDraft?.pfosten}
        <p class="draft-kataster-meta">
          Kataster-Wegweiser-Nr.: <strong>{selectedDraft.kataster_wegweiser_nr || 'keine Angabe'}</strong>
        </p>
      {/if}
      <div class="draft-save-panel">
        <label>
          <span>Entwurfstitel</span>
          <input
            placeholder="Neuer Wegweiser-Entwurf"
            type="text"
            value={entwurfTitel}
            oninput={(event) => {
              entwurfTitel = event.currentTarget.value;
              isDraftTitleManual = true;
            }}
          />
        </label>
        <div class="draft-meta-grid">
          <label>
            <span>Status</span>
            <select
              value={wegweiserStatus}
              onchange={(event) => {
                wegweiserStatus = event.currentTarget.value;
              }}
            >
              <option value="">kein Status</option>
              {#each wegweiserStatusOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>
          <label>
            <span>Interne Wegweisernummer</span>
            <input
              placeholder="WW-000123"
              type="text"
              value={wegweiserNr}
              oninput={(event) => {
                wegweiserNr = event.currentTarget.value;
              }}
            />
          </label>
          <label>
            <span>Offizielle Wegweisernummer</span>
            <input
              placeholder="305678"
              type="text"
              value={offizielleWegweiserNr}
              oninput={(event) => {
                offizielleWegweiserNr = event.currentTarget.value;
              }}
            />
          </label>
          <label>
            <span>Kataster-Wegweisernummer</span>
            <input
              placeholder="301803"
              type="text"
              value={katasterWegweiserNr}
              oninput={(event) => {
                katasterWegweiserNr = event.currentTarget.value;
              }}
            />
          </label>
          <label>
            <span>Pfosten</span>
            <select
              value={pfostenId}
              onchange={(event) => {
                pfostenId = event.currentTarget.value;
              }}
            >
              <option value="">nicht vergeben</option>
              {#if pfostenId && !selectedPfostenOptionExists}
                <option value={pfostenId}>{pfostenId}</option>
              {/if}
              {#each data.pfostenOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>
        </div>
        <div class="draft-save-actions">
          <button class="button draft-save-button" disabled={isSavingDraft} type="button" onclick={() => saveDraft(false)}>
            {isSavingDraft ? 'Speichert...' : currentDraftId ? 'Entwurf aktualisieren' : 'Entwurf speichern'}
          </button>
          <button class="button draft-new-button" disabled={isSavingDraft} type="button" onclick={() => saveDraft(true)}>
            Als neuen Entwurf speichern
          </button>
          <button class="button draft-reset-button" disabled={isSavingDraft} type="button" onclick={resetToNewDraft}>
            Neuer Entwurf
          </button>
        </div>
      </div>
      {#if saveDraftMessage}
        <p class="form-success">{saveDraftMessage}</p>
      {/if}
      {#if saveDraftError}
        <p class="form-error">{saveDraftError}</p>
      {/if}
      <WegweiserForm
        bind:data={wegweiser}
        {errors}
        formatOptions={data.wegweiserFormats}
        pictogramOptions={data.pictogramOptions}
        routeOptions={data.routeOptions}
      />
    </div>

    <div class="panel preview-panel">
      <p class="eyebrow">Vorschau</p>
      <h2>Wegweiser-Vorschau</h2>
      <WegweiserPreview
        data={wegweiser}
        draftTitle={entwurfTitel}
        formats={data.wegweiserFormats}
        formatErrors={data.wegweiserFormatErrors}
        pictogramOptions={data.pictogramOptions}
        routeOptions={data.routeOptions}
      />
    </div>
  </section>
</main>

<script lang="ts">
  import WegweiserForm from '$lib/components/WegweiserForm.svelte';
  import WegweiserPreview from '$lib/components/WegweiserPreview.svelte';
  import { defaultWegweiserData, validateWegweiser } from '$lib/wegweiser';
  import type { WegweiserData, WegweiserOption } from '$lib/wegweiser';

  let {
    data
  }: {
    data: {
      pictogramOptions: WegweiserOption[];
      routeOptions: WegweiserOption[];
      pocketBaseWarning: string | null;
    };
  } = $props();

  function getInitialWegweiserData(): WegweiserData {
    return {
      ...defaultWegweiserData,
      farPictograms: [],
      farRoutePictograms: [],
      nearPictograms: [],
      nearRoutePictograms: [],
      routes: data.routeOptions.slice(0, 2).map((option) => ({
        type: 'themenroute',
        route: option.value
      }))
    };
  }

  function getDefaultDraftTitle(wegweiser: WegweiserData) {
    const parts = [wegweiser.farDestination.trim(), wegweiser.nearDestination.trim()].filter(Boolean);

    return parts.length ? parts.join(' / ') : 'Neuer Wegweiser-Entwurf';
  }

  const initialWegweiser = getInitialWegweiserData();

  let wegweiser = $state<WegweiserData>(initialWegweiser);
  let entwurfTitel = $state(getDefaultDraftTitle(initialWegweiser));
  let isSavingDraft = $state(false);
  let saveDraftMessage = $state<string | null>(null);
  let saveDraftError = $state<string | null>(null);
  const errors = $derived(validateWegweiser(wegweiser));

  async function saveDraft() {
    saveDraftMessage = null;
    saveDraftError = null;

    if (errors.form || errors.farDistance || errors.nearDistance) {
      saveDraftError = 'Bitte korrigiere zuerst die Eingaben im Formular.';
      return;
    }

    isSavingDraft = true;

    try {
      const response = await fetch('/api/entwuerfe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          titel: entwurfTitel,
          wegweiser
        })
      });

      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        saveDraftError = result.message ?? 'Der Entwurf konnte nicht gespeichert werden.';
        return;
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
      <div class="draft-save-panel">
        <label>
          <span>Entwurfstitel</span>
          <input bind:value={entwurfTitel} placeholder="Neuer Wegweiser-Entwurf" type="text" />
        </label>
        <button class="button draft-save-button" disabled={isSavingDraft} type="button" onclick={saveDraft}>
          {isSavingDraft ? 'Speichert...' : 'Entwurf speichern'}
        </button>
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
        pictogramOptions={data.pictogramOptions}
        routeOptions={data.routeOptions}
      />
    </div>

    <div class="panel preview-panel">
      <p class="eyebrow">Vorschau</p>
      <h2>Wegweiser-Vorschau</h2>
      <WegweiserPreview
        data={wegweiser}
        pictogramOptions={data.pictogramOptions}
        routeOptions={data.routeOptions}
      />
    </div>
  </section>
</main>

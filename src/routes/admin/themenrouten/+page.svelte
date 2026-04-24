<script lang="ts">
  type ThemenrouteItem = {
    id: string;
    name: string;
    kurzlabel: string;
    slug: string;
    beschreibung: string;
    aktiv: boolean;
    sortierung: number | null;
    imageUrl?: string;
    imageType: 'svg' | 'png' | null;
  };

  let {
    data,
    form
  }: {
    data: {
      themenrouten: ThemenrouteItem[];
      pocketBaseWarning: string | null;
    };
    form?: {
      success?: boolean;
      action?: 'create' | 'update' | 'delete';
      message?: string;
      values?: Record<string, FormDataEntryValue>;
    };
  } = $props();

  let editingRouteId = $state<string | null>(null);
  let deleteCandidateId = $state<string | null>(null);

  function getStringValue(field: string): string {
    const value = form?.values?.[field];
    return typeof value === 'string' ? value : '';
  }

  function isChecked(field: string): boolean {
    return form?.values?.[field] === 'on';
  }

  function getEditStringValue(route: ThemenrouteItem, field: keyof ThemenrouteItem): string {
    if (form?.action === 'update' && getStringValue('id') === route.id) {
      return getStringValue(field);
    }

    const value = route[field];
    return typeof value === 'string' ? value : value === null ? '' : String(value);
  }

  function getEditChecked(route: ThemenrouteItem): boolean {
    if (form?.action === 'update' && getStringValue('id') === route.id) {
      return isChecked('aktiv');
    }

    return route.aktiv;
  }

  $effect(() => {
    if (form?.success && (form.action === 'update' || form.action === 'delete')) {
      editingRouteId = null;
      deleteCandidateId = null;
    } else if (!form?.success && form?.action === 'update') {
      editingRouteId = getStringValue('id') || editingRouteId;
    }
  });
</script>

<svelte:head>
  <title>Themenrouten verwalten | HBR-Wegweiser-Generator</title>
</svelte:head>

<main class="page admin-page">
  <header class="editor-header">
    <a href="/">Startseite</a>
    <h1>Themenrouten verwalten</h1>
    <p>Vorhandene Themenrouten pruefen und neue Datensaetze mit SVG- oder PNG-Logo anlegen.</p>
  </header>

  {#if data.pocketBaseWarning}
    <p class="form-message error-message">{data.pocketBaseWarning}</p>
  {/if}

  {#if form?.message}
    <p class:success-message={form.success} class:error-message={!form.success} class="form-message">
      {form.message}
    </p>
  {/if}

  <div class="admin-grid">
    <section class="panel">
      <h2>Neue Themenroute</h2>
      <form method="POST" action="?/create" enctype="multipart/form-data" class="admin-form">
        <label class="field">
          <span>Name</span>
          <input name="name" type="text" required value={getStringValue('name')} />
        </label>

        <div class="field-row two-columns">
          <label class="field">
            <span>Slug</span>
            <input name="slug" type="text" required value={getStringValue('slug')} />
          </label>
          <label class="field">
            <span>Kurzlabel</span>
            <input name="kurzlabel" type="text" required value={getStringValue('kurzlabel')} />
          </label>
        </div>

        <label class="field">
          <span>Beschreibung</span>
          <textarea name="beschreibung" rows="4">{getStringValue('beschreibung')}</textarea>
        </label>

        <div class="field-row two-columns">
          <label class="field">
            <span>Datei (SVG oder PNG)</span>
            <input name="datei" type="file" accept=".svg,image/svg+xml,.png,image/png" required />
          </label>
          <label class="field">
            <span>Sortierung</span>
            <input name="sortierung" type="number" step="1" value={getStringValue('sortierung')} />
          </label>
        </div>

        <label class="checkbox-field">
          <input name="aktiv" type="checkbox" checked={form?.values ? isChecked('aktiv') : true} />
          <span>Aktiv</span>
        </label>

        <button class="button" type="submit">Themenroute speichern</button>
      </form>
    </section>

    <section class="panel">
      <h2>Vorhandene Themenrouten</h2>

      {#if data.themenrouten.length}
        <div class="admin-route-list">
          {#each data.themenrouten as route}
            <article class="admin-route-item">
              <div class="admin-route-preview">
                {#if route.imageUrl}
                  <img src={route.imageUrl} alt={`Logo ${route.name}`} loading="lazy" />
                {:else}
                  <div class="admin-route-preview-placeholder">Kein Logo</div>
                {/if}
              </div>
              <div class="admin-route-content">
                <div class="admin-route-header">
                  <strong>{route.name}</strong>
                  <span class:status-active={route.aktiv} class="status-badge">
                    {route.aktiv ? 'aktiv' : 'inaktiv'}
                  </span>
                </div>

                <dl class="admin-route-meta">
                  <div>
                    <dt>Kurzlabel</dt>
                    <dd>{route.kurzlabel || '—'}</dd>
                  </div>
                  <div>
                    <dt>Slug</dt>
                    <dd>{route.slug || '—'}</dd>
                  </div>
                  <div>
                    <dt>Sortierung</dt>
                    <dd>{route.sortierung ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Datei</dt>
                    <dd>{route.imageType ?? '—'}</dd>
                  </div>
                </dl>

                {#if route.beschreibung}
                  <p>{route.beschreibung}</p>
                {/if}

                <div class="admin-route-actions">
                  <button
                    class="button secondary-button admin-action-button"
                    type="button"
                    onclick={() => {
                      editingRouteId = editingRouteId === route.id ? null : route.id;
                      deleteCandidateId = null;
                    }}
                  >
                    {editingRouteId === route.id ? 'Bearbeiten schließen' : 'Bearbeiten'}
                  </button>
                  <button
                    class="button secondary-button admin-delete-button"
                    type="button"
                    onclick={() => {
                      deleteCandidateId = deleteCandidateId === route.id ? null : route.id;
                      editingRouteId = null;
                    }}
                  >
                    Löschen
                  </button>
                </div>

                {#if editingRouteId === route.id}
                  <form method="POST" action="?/update" enctype="multipart/form-data" class="admin-edit-form">
                    <input name="id" type="hidden" value={route.id} />

                    <div class="field-row two-columns">
                      <label class="field">
                        <span>Name</span>
                        <input name="name" type="text" required value={getEditStringValue(route, 'name')} />
                      </label>
                      <label class="field">
                        <span>Slug</span>
                        <input name="slug" type="text" required value={getEditStringValue(route, 'slug')} />
                      </label>
                    </div>

                    <div class="field-row two-columns">
                      <label class="field">
                        <span>Kurzlabel</span>
                        <input
                          name="kurzlabel"
                          type="text"
                          required
                          value={getEditStringValue(route, 'kurzlabel')}
                        />
                      </label>
                      <label class="field">
                        <span>Sortierung</span>
                        <input
                          name="sortierung"
                          type="number"
                          step="1"
                          value={getEditStringValue(route, 'sortierung')}
                        />
                      </label>
                    </div>

                    <label class="field">
                      <span>Beschreibung</span>
                      <textarea name="beschreibung" rows="3">{getEditStringValue(route, 'beschreibung')}</textarea>
                    </label>

                    <div class="field-row two-columns">
                      <label class="field">
                        <span>Logo ersetzen (optional)</span>
                        <input name="datei" type="file" accept=".svg,image/svg+xml,.png,image/png" />
                      </label>
                      <label class="checkbox-field admin-checkbox-field">
                        <input name="aktiv" type="checkbox" checked={getEditChecked(route)} />
                        <span>Aktiv</span>
                      </label>
                    </div>

                    <div class="admin-edit-actions">
                      <button class="button admin-save-button" type="submit">Änderungen speichern</button>
                      <button
                        class="button secondary-button admin-action-button"
                        type="button"
                        onclick={() => {
                          editingRouteId = null;
                        }}
                      >
                        Abbrechen
                      </button>
                    </div>
                  </form>
                {/if}

                {#if deleteCandidateId === route.id}
                  <div class="draft-delete-confirm admin-delete-confirm">
                    <p>Diese Themenroute wirklich löschen?</p>
                    <form method="POST" action="?/delete" class="admin-delete-form">
                      <input name="id" type="hidden" value={route.id} />
                      <div class="draft-delete-confirm-actions">
                        <button
                          type="button"
                          onclick={() => {
                            deleteCandidateId = null;
                          }}
                        >
                          Abbrechen
                        </button>
                        <button type="submit">OK</button>
                      </div>
                    </form>
                  </div>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <p>Es sind aktuell keine Themenrouten vorhanden.</p>
      {/if}
    </section>
  </div>
</main>

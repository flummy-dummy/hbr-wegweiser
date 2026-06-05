<script lang="ts">
  import type {
    DuplicateWarning,
    PfostenContext,
    StatusStats,
    WegweiserAdminItem
  } from './+page.server';
  import type { WegweiserStatus } from '$lib/wegweiser';

  type SortField =
    | 'wegweiser_nr'
    | 'offizielle_wegweiser_nr'
    | 'kataster_wegweiser_nr'
    | 'status'
    | 'titel'
    | 'pfosten'
    | 'created'
    | 'updated';

  let {
    data
  }: {
    data: {
      wegweiser: WegweiserAdminItem[];
      selectedWegweiser: WegweiserAdminItem | null;
      duplicateWarnings: DuplicateWarning[];
      pfostenContext: PfostenContext | null;
      statusStats: StatusStats;
      pagination: {
        page: number;
        perPage: number;
        totalItems: number;
        totalPages: number;
      };
      params: {
        search: string;
        sortField: SortField;
        direction: 'asc' | 'desc';
        pfosten: 'all' | 'yes' | 'no';
        offizielle: 'all' | 'yes' | 'no';
        kataster: 'all' | 'yes' | 'no';
        aktiv: 'all' | 'active' | 'inactive';
        status: 'all' | WegweiserStatus;
        selectedId: string;
      };
      pocketBaseWarning: string | null;
    };
  } = $props();

  function display(value: string | null | undefined, fallback = '-'): string {
    return value?.trim() ? value.trim() : fallback;
  }

  function activeLabel(value: boolean | null): string {
    if (value === true) {
      return 'aktiv';
    }

    if (value === false) {
      return 'inaktiv';
    }

    return 'keine Angabe';
  }

  function statusLabel(value: WegweiserStatus | '' | null | undefined): string {
    return value || 'kein Status';
  }

  function statusClass(value: WegweiserStatus | '' | null | undefined): string {
    return `status-${value || 'none'}`;
  }

  function dateLabel(value: string): string {
    if (!value) {
      return '-';
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

  function buildHref(overrides: Record<string, string | number | null | undefined>): string {
    const params = new URLSearchParams();
    const baseValues: Record<string, string | number> = {
      q: data.params.search,
      sort: data.params.sortField,
      dir: data.params.direction,
      pfosten: data.params.pfosten,
      offizielle: data.params.offizielle,
      kataster: data.params.kataster,
      aktiv: data.params.aktiv,
      status: data.params.status,
      perPage: data.pagination.perPage,
      page: data.pagination.page,
      selected: data.params.selectedId
    };

    for (const [key, value] of Object.entries({ ...baseValues, ...overrides })) {
      if (value === null || value === undefined || value === '' || value === 'all') {
        continue;
      }

      if (key === 'page' && Number(value) <= 1) {
        continue;
      }

      params.set(key, String(value));
    }

    const query = params.toString();
    return query ? `/admin/wegweiser?${query}` : '/admin/wegweiser';
  }

  function sortHref(field: SortField): string {
    const nextDirection =
      data.params.sortField === field && data.params.direction === 'asc' ? 'desc' : 'asc';

    return buildHref({
      sort: field,
      dir: nextDirection,
      page: 1
    });
  }

  function sortIndicator(field: SortField): string {
    if (data.params.sortField !== field) {
      return '';
    }

    return data.params.direction === 'asc' ? ' ↑' : ' ↓';
  }

  function targets(wegweiser: WegweiserAdminItem): string {
    const top = [wegweiser.ziel_oben_text, wegweiser.ziel_oben_entfernung].filter(Boolean).join(' ');
    const bottom = [wegweiser.ziel_unten_text, wegweiser.ziel_unten_entfernung].filter(Boolean).join(' ');
    return [top, bottom].filter(Boolean).join(' / ') || 'keine Angabe';
  }
</script>

<svelte:head>
  <title>Wegweiser verwalten | HBR-Wegweiser-Generator</title>
</svelte:head>

<main class="page admin-page wegweiser-admin-page">
  <header class="editor-header">
    <a href="/">Startseite</a>
    <h1>Wegweiser verwalten</h1>
    <p>Zentrale Pflegeuebersicht fuer Wegweiser-Entwuerfe, Kataster- und Produktionsnummern.</p>
  </header>

  {#if data.pocketBaseWarning}
    <p class="form-message error-message">{data.pocketBaseWarning}</p>
  {/if}

  <section class="panel wegweiser-admin-controls" aria-label="Wegweiser suchen und filtern">
    <form method="GET" class="wegweiser-filter-form">
      <label class="field wegweiser-search-field">
        <span>Suche</span>
        <input
          name="q"
          placeholder="3018, WW-00012 oder Titel"
          type="search"
          value={data.params.search}
        />
      </label>

      <label class="field">
        <span>Pfosten vorhanden</span>
        <select name="pfosten" value={data.params.pfosten}>
          <option value="all">Alle</option>
          <option value="yes">Mit Pfosten</option>
          <option value="no">Ohne Pfosten</option>
        </select>
      </label>

      <label class="field">
        <span>Offizielle Nummer</span>
        <select name="offizielle" value={data.params.offizielle}>
          <option value="all">Alle</option>
          <option value="yes">Mit offizieller Nummer</option>
          <option value="no">Ohne offizielle Nummer</option>
        </select>
      </label>

      <label class="field">
        <span>Katasternummer</span>
        <select name="kataster" value={data.params.kataster}>
          <option value="all">Alle</option>
          <option value="yes">Mit Katasternummer</option>
          <option value="no">Ohne Katasternummer</option>
        </select>
      </label>

      <label class="field">
        <span>Status</span>
        <select name="status" value={data.params.status}>
          <option value="all">Alle</option>
          <option value="entwurf">entwurf</option>
          <option value="bestellt">bestellt</option>
          <option value="produziert">produziert</option>
          <option value="montiert">montiert</option>
          <option value="entfernt">entfernt</option>
        </select>
      </label>

      <label class="field">
        <span>Aktiv</span>
        <select name="aktiv" value={data.params.aktiv}>
          <option value="all">Alle</option>
          <option value="active">Aktiv</option>
          <option value="inactive">Inaktiv</option>
        </select>
      </label>

      <label class="field">
        <span>Pro Seite</span>
        <select name="perPage" value={String(data.pagination.perPage)}>
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
      </label>

      <input name="sort" type="hidden" value={data.params.sortField} />
      <input name="dir" type="hidden" value={data.params.direction} />
      {#if data.params.selectedId}
        <input name="selected" type="hidden" value={data.params.selectedId} />
      {/if}

      <div class="wegweiser-filter-actions">
        <button class="button" type="submit">Anwenden</button>
        <a class="button secondary-button" href="/admin/wegweiser">Zuruecksetzen</a>
      </div>
    </form>
  </section>

  <section class="wegweiser-status-summary" aria-label="Statusuebersicht">
    <div class="status-summary-item status-entwurf">
      <span>Entwuerfe</span>
      <strong>{data.statusStats.entwurf}</strong>
    </div>
    <div class="status-summary-item status-bestellt">
      <span>Bestellt</span>
      <strong>{data.statusStats.bestellt}</strong>
    </div>
    <div class="status-summary-item status-produziert">
      <span>Produziert</span>
      <strong>{data.statusStats.produziert}</strong>
    </div>
    <div class="status-summary-item status-montiert">
      <span>Montiert</span>
      <strong>{data.statusStats.montiert}</strong>
    </div>
    <div class="status-summary-item status-entfernt">
      <span>Entfernt</span>
      <strong>{data.statusStats.entfernt}</strong>
    </div>
  </section>

  <section class="wegweiser-admin-layout">
    <div class="panel wegweiser-table-panel">
      <div class="wegweiser-table-header">
        <h2>Wegweiser</h2>
        <span>{data.pagination.totalItems} Datensaetze</span>
      </div>

      <div class="wegweiser-table-scroll">
        <table class="wegweiser-table">
          <thead>
            <tr>
              <th><a href={sortHref('wegweiser_nr')}>Interne Nr.{sortIndicator('wegweiser_nr')}</a></th>
              <th><a href={sortHref('offizielle_wegweiser_nr')}>Offizielle Nr.{sortIndicator('offizielle_wegweiser_nr')}</a></th>
              <th><a href={sortHref('kataster_wegweiser_nr')}>Kataster{sortIndicator('kataster_wegweiser_nr')}</a></th>
              <th><a href={sortHref('status')}>Status{sortIndicator('status')}</a></th>
              <th><a href={sortHref('titel')}>Titel{sortIndicator('titel')}</a></th>
              <th><a href={sortHref('pfosten')}>Pfosten{sortIndicator('pfosten')}</a></th>
              <th>Typ</th>
              <th>Richtung</th>
              <th>Aktiv</th>
              <th><a href={sortHref('created')}>Created{sortIndicator('created')}</a></th>
              <th><a href={sortHref('updated')}>Updated{sortIndicator('updated')}</a></th>
            </tr>
          </thead>
          <tbody>
            {#if data.wegweiser.length}
              {#each data.wegweiser as wegweiser}
                <tr class:wegweiser-row-selected={data.params.selectedId === wegweiser.id}>
                  <td>
                    <a href={buildHref({ selected: wegweiser.id })}>{display(wegweiser.wegweiser_nr)}</a>
                  </td>
                  <td>{display(wegweiser.offizielle_wegweiser_nr)}</td>
                  <td>{display(wegweiser.kataster_wegweiser_nr)}</td>
                  <td>
                    <span class={`wegweiser-status-badge ${statusClass(wegweiser.status)}`}>
                      {statusLabel(wegweiser.status)}
                    </span>
                  </td>
                  <td>{display(wegweiser.titel, 'Ohne Titel')}</td>
                  <td>{display(wegweiser.pfostenLabel, 'nicht vergeben')}</td>
                  <td>{display(wegweiser.wegweiser_typ)}</td>
                  <td>{display(wegweiser.richtung)}</td>
                  <td>{activeLabel(wegweiser.aktiv)}</td>
                  <td>{dateLabel(wegweiser.created)}</td>
                  <td>{dateLabel(wegweiser.updated)}</td>
                </tr>
              {/each}
            {:else}
              <tr>
                <td colspan="11">Keine Wegweiser gefunden.</td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>

      <nav class="wegweiser-pagination" aria-label="Seitennavigation">
        <a
          class:pagination-disabled={data.pagination.page <= 1}
          href={data.pagination.page <= 1 ? undefined : buildHref({ page: data.pagination.page - 1 })}
        >
          Vorherige
        </a>
        <span>Seite {data.pagination.page} von {data.pagination.totalPages || 1}</span>
        <a
          class:pagination-disabled={data.pagination.page >= data.pagination.totalPages}
          href={data.pagination.page >= data.pagination.totalPages ? undefined : buildHref({ page: data.pagination.page + 1 })}
        >
          Naechste
        </a>
      </nav>
    </div>

    <aside class="panel wegweiser-detail-panel">
      <h2>Detailansicht</h2>
      {#if data.selectedWegweiser}
        <dl class="wegweiser-detail-list">
          <div>
            <dt>Interne Wegweisernummer</dt>
            <dd>{display(data.selectedWegweiser.wegweiser_nr)}</dd>
          </div>
          <div>
            <dt>Offizielle Wegweisernummer</dt>
            <dd>{display(data.selectedWegweiser.offizielle_wegweiser_nr)}</dd>
          </div>
          <div>
            <dt>Kataster-Wegweisernummer</dt>
            <dd>{display(data.selectedWegweiser.kataster_wegweiser_nr)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span class={`wegweiser-status-badge ${statusClass(data.selectedWegweiser.status)}`}>
                {statusLabel(data.selectedWegweiser.status)}
              </span>
            </dd>
          </div>
          <div>
            <dt>Pfosten</dt>
            <dd>{display(data.selectedWegweiser.pfostenLabel, 'nicht vergeben')}</dd>
          </div>
          <div>
            <dt>Titel</dt>
            <dd>{display(data.selectedWegweiser.titel, 'Ohne Titel')}</dd>
          </div>
          <div>
            <dt>Wegweisertyp</dt>
            <dd>{display(data.selectedWegweiser.wegweiser_typ)}</dd>
          </div>
          <div>
            <dt>Richtung</dt>
            <dd>{display(data.selectedWegweiser.richtung)}</dd>
          </div>
          <div>
            <dt>Ziele / Entfernungen</dt>
            <dd>{targets(data.selectedWegweiser)}</dd>
          </div>
          <div>
            <dt>Notizen</dt>
            <dd>{display(data.selectedWegweiser.notizen, 'keine Angabe')}</dd>
          </div>
        </dl>

        {#if data.duplicateWarnings.length}
          <section class="wegweiser-warning-box" aria-label="Nummernwarnungen">
            <h3>Nummernpruefung</h3>
            {#each data.duplicateWarnings as warning}
              <p>
                {warning.label} <strong>{warning.value}</strong> ist {warning.count}x vergeben.
              </p>
            {/each}
          </section>
        {/if}

        <section class="wegweiser-pfosten-context">
          <h3>Pfosten</h3>
          {#if data.pfostenContext}
            <p>
              {data.pfostenContext.label}
              <br />
              {data.pfostenContext.wegweiserCount} Wegweiser vorhanden
            </p>
            <ul class="wegweiser-related-list">
              {#each data.pfostenContext.wegweiser as related}
                <li>
                  <a href={buildHref({ selected: related.id })}>
                    {display(related.wegweiser_nr, 'keine interne Nr.')}
                  </a>
                  <span>Kataster {display(related.kataster_wegweiser_nr)}</span>
                  <span>{statusLabel(related.status)}</span>
                </li>
              {/each}
            </ul>
          {:else}
            <p>Kein Pfosten zugeordnet.</p>
          {/if}
        </section>
      {:else}
        <p>Datensatz in der Tabelle auswaehlen, um Details anzuzeigen.</p>
      {/if}
    </aside>
  </section>
</main>

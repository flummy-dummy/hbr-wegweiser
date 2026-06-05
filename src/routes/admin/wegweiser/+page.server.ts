import type { PageServerLoad } from './$types';
import type { WegweiserStatus } from '$lib/wegweiser';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';

type WegweiserSortField =
  | 'wegweiser_nr'
  | 'offizielle_wegweiser_nr'
  | 'kataster_wegweiser_nr'
  | 'status'
  | 'titel'
  | 'pfosten'
  | 'created'
  | 'updated';

type WegweiserFilterValue = 'all' | 'yes' | 'no';
type AktivFilterValue = 'all' | 'active' | 'inactive';
type StatusFilterValue = 'all' | WegweiserStatus;

export type WegweiserAdminItem = {
  id: string;
  titel: string;
  wegweiser_nr: string;
  offizielle_wegweiser_nr: string;
  kataster_wegweiser_nr: string;
  pfosten: string;
  pfostenLabel: string;
  status: WegweiserStatus | '';
  wegweiser_typ: string;
  richtung: string;
  ziel_oben_text: string;
  ziel_oben_entfernung: string;
  ziel_unten_text: string;
  ziel_unten_entfernung: string;
  notizen: string;
  aktiv: boolean | null;
  created: string;
  updated: string;
};

export type StatusStats = Record<WegweiserStatus, number>;

export type DuplicateWarning = {
  field: 'wegweiser_nr' | 'offizielle_wegweiser_nr' | 'kataster_wegweiser_nr';
  label: string;
  value: string;
  count: number;
};

export type PfostenContext = {
  id: string;
  label: string;
  wegweiserCount: number;
  wegweiser: Array<{
    id: string;
    titel: string;
    wegweiser_nr: string;
    kataster_wegweiser_nr: string;
    status: WegweiserStatus | '';
  }>;
};

const SORT_FIELDS = new Set<WegweiserSortField>([
  'wegweiser_nr',
  'offizielle_wegweiser_nr',
  'kataster_wegweiser_nr',
  'status',
  'titel',
  'pfosten',
  'created',
  'updated'
]);
const STATUS_VALUES: WegweiserStatus[] = ['entwurf', 'bestellt', 'produziert', 'montiert', 'entfernt'];
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

function stringField(record: RecordModel, fields: string[], fallback = ''): string {
  for (const field of fields) {
    const value = record[field];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return fallback;
}

function relationIdField(record: RecordModel, field: string): string {
  const value = record[field];

  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
    return value[0].trim();
  }

  return '';
}

function expandedRecord(record: RecordModel, field: string): RecordModel | null {
  const value = record.expand?.[field];

  if (Array.isArray(value)) {
    return (value[0] as RecordModel | undefined) ?? null;
  }

  return value && typeof value === 'object' ? (value as RecordModel) : null;
}

function pfostenLabel(record: RecordModel | null, fallbackId = ''): string {
  if (!record) {
    return fallbackId ? fallbackId : 'nicht vergeben';
  }

  return stringField(record, ['pfosten_kennung', 'pfosten_nr', 'typ'], fallbackId || 'Pfosten');
}

function statusField(record: RecordModel): WegweiserStatus | '' {
  const value = stringField(record, ['status']);
  return STATUS_VALUES.includes(value as WegweiserStatus) ? (value as WegweiserStatus) : '';
}

function mapWegweiser(record: RecordModel): WegweiserAdminItem {
  const pfosten = relationIdField(record, 'pfosten');

  return {
    id: String(record.id ?? ''),
    titel: stringField(record, ['titel'], 'Ohne Titel'),
    wegweiser_nr: stringField(record, ['wegweiser_nr']),
    offizielle_wegweiser_nr: stringField(record, ['offizielle_wegweiser_nr']),
    kataster_wegweiser_nr: stringField(record, ['kataster_wegweiser_nr']),
    pfosten,
    pfostenLabel: pfostenLabel(expandedRecord(record, 'pfosten'), pfosten),
    status: statusField(record),
    wegweiser_typ: stringField(record, ['wegweiser_typ']),
    richtung: stringField(record, ['richtung']),
    ziel_oben_text: stringField(record, ['ziel_oben_text']),
    ziel_oben_entfernung: stringField(record, ['ziel_oben_entfernung']),
    ziel_unten_text: stringField(record, ['ziel_unten_text']),
    ziel_unten_entfernung: stringField(record, ['ziel_unten_entfernung']),
    notizen: stringField(record, ['notizen']),
    aktiv: typeof record.aktiv === 'boolean' ? record.aktiv : null,
    created: stringField(record, ['created']),
    updated: stringField(record, ['updated'])
  };
}

function normalizedFilter(value: string | null): WegweiserFilterValue {
  return value === 'yes' || value === 'no' ? value : 'all';
}

function normalizedAktivFilter(value: string | null): AktivFilterValue {
  return value === 'active' || value === 'inactive' ? value : 'all';
}

function normalizedStatusFilter(value: string | null): StatusFilterValue {
  return STATUS_VALUES.includes(value as WegweiserStatus) ? (value as WegweiserStatus) : 'all';
}

function buildListFilter(
  pb: PocketBase,
  params: {
    search: string;
    pfosten: WegweiserFilterValue;
    offizielle: WegweiserFilterValue;
    kataster: WegweiserFilterValue;
    aktiv: AktivFilterValue;
    status: StatusFilterValue;
  }
): string {
  const filters: string[] = [];

  if (params.search) {
    filters.push(
      pb.filter(
        '(wegweiser_nr ~ {:search} || offizielle_wegweiser_nr ~ {:search} || kataster_wegweiser_nr ~ {:search} || titel ~ {:search})',
        { search: params.search }
      )
    );
  }

  if (params.pfosten === 'yes') {
    filters.push("pfosten != ''");
  } else if (params.pfosten === 'no') {
    filters.push("pfosten = ''");
  }

  if (params.offizielle === 'yes') {
    filters.push("offizielle_wegweiser_nr != ''");
  } else if (params.offizielle === 'no') {
    filters.push("offizielle_wegweiser_nr = ''");
  }

  if (params.kataster === 'yes') {
    filters.push("kataster_wegweiser_nr != ''");
  } else if (params.kataster === 'no') {
    filters.push("kataster_wegweiser_nr = ''");
  }

  if (params.aktiv === 'active') {
    filters.push('aktiv = true');
  } else if (params.aktiv === 'inactive') {
    filters.push('aktiv != true');
  }

  if (params.status !== 'all') {
    filters.push(pb.filter('status = {:status}', { status: params.status }));
  }

  return filters.join(' && ');
}

async function loadStatusStats(pb: PocketBase): Promise<StatusStats> {
  try {
    const entries: Array<readonly [WegweiserStatus, number]> = [];

    for (const status of STATUS_VALUES) {
      const result = await pb.collection('wegweiser_entwuerfe').getList<RecordModel>(1, 1, {
        filter: pb.filter('status = {:status}', { status })
      });

      entries.push([status, result.totalItems] as const);
    }

    return Object.fromEntries(entries) as StatusStats;
  } catch (error) {
    console.error('Statusstatistik konnte nicht geladen werden.', error);
    return {
      entwurf: 0,
      bestellt: 0,
      produziert: 0,
      montiert: 0,
      entfernt: 0
    };
  }
}

async function duplicateWarning(
  pb: PocketBase,
  record: WegweiserAdminItem,
  field: DuplicateWarning['field'],
  label: string
): Promise<DuplicateWarning | null> {
  const value = record[field];

  if (!value) {
    return null;
  }

  const result = await pb.collection('wegweiser_entwuerfe').getList<RecordModel>(1, 1, {
    filter: pb.filter(`${field} = {:value}`, { value })
  });

  return result.totalItems > 1
    ? {
        field,
        label,
        value,
        count: result.totalItems
      }
    : null;
}

async function loadPfostenContext(pb: PocketBase, record: WegweiserAdminItem): Promise<PfostenContext | null> {
  if (!record.pfosten) {
    return null;
  }

  const related = await pb.collection('wegweiser_entwuerfe').getList<RecordModel>(1, 50, {
    filter: pb.filter('pfosten = {:pfosten}', { pfosten: record.pfosten }),
    sort: 'wegweiser_nr,titel'
  });

  return {
    id: record.pfosten,
    label: record.pfostenLabel,
    wegweiserCount: related.totalItems,
    wegweiser: related.items.map((entry) => ({
      id: String(entry.id ?? ''),
      titel: stringField(entry, ['titel'], 'Ohne Titel'),
      wegweiser_nr: stringField(entry, ['wegweiser_nr']),
      kataster_wegweiser_nr: stringField(entry, ['kataster_wegweiser_nr']),
      status: statusField(entry)
    }))
  };
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const pbAdmin = locals.pb;
  const search = url.searchParams.get('q')?.trim() ?? '';
  const sortField = SORT_FIELDS.has(url.searchParams.get('sort') as WegweiserSortField)
    ? (url.searchParams.get('sort') as WegweiserSortField)
    : 'updated';
  const direction = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const requestedPerPage = Number(url.searchParams.get('perPage')) || 50;
  const perPage = PAGE_SIZE_OPTIONS.includes(requestedPerPage as (typeof PAGE_SIZE_OPTIONS)[number])
    ? requestedPerPage
    : 50;
  const filters = {
    pfosten: normalizedFilter(url.searchParams.get('pfosten')),
    offizielle: normalizedFilter(url.searchParams.get('offizielle')),
    kataster: normalizedFilter(url.searchParams.get('kataster')),
    aktiv: normalizedAktivFilter(url.searchParams.get('aktiv')),
    status: normalizedStatusFilter(url.searchParams.get('status'))
  };
  const selectedId = url.searchParams.get('selected')?.trim() ?? '';

  if (!pbAdmin) {
    return {
      wegweiser: [] satisfies WegweiserAdminItem[],
      selectedWegweiser: null,
      duplicateWarnings: [] satisfies DuplicateWarning[],
      pfostenContext: null,
      statusStats: {
        entwurf: 0,
        bestellt: 0,
        produziert: 0,
        montiert: 0,
        entfernt: 0
      } satisfies StatusStats,
      pagination: { page, perPage, totalItems: 0, totalPages: 1 },
      params: { search, sortField, direction, ...filters, selectedId },
      pocketBaseWarning:
        'PocketBase ist nicht konfiguriert. Wegweiser koennen nicht geladen werden.'
    };
  }

  try {
    const filter = buildListFilter(pbAdmin, {
      search,
      pfosten: filters.pfosten,
      offizielle: filters.offizielle,
      kataster: filters.kataster,
      aktiv: filters.aktiv,
      status: filters.status
    });
    const listOptions: { filter?: string; sort?: string } = {
      sort: `${direction === 'desc' ? '-' : ''}${sortField}`
    };

    if (filter) {
      listOptions.filter = filter;
    }

    const result = await pbAdmin.collection('wegweiser_entwuerfe').getList<RecordModel>(
      page,
      perPage,
      listOptions
    );
    const statusStats = await loadStatusStats(pbAdmin);
    const wegweiser = result.items.map((record) => mapWegweiser(record));
    let selectedWegweiser: WegweiserAdminItem | null = null;

    if (selectedId) {
      try {
        const selectedRecord = await pbAdmin.collection('wegweiser_entwuerfe').getOne<RecordModel>(selectedId, {
          expand: 'pfosten'
        });
        selectedWegweiser = mapWegweiser(selectedRecord);
      } catch {
        selectedWegweiser = null;
      }
    }

    const duplicateWarnings = selectedWegweiser
      ? (
          await Promise.all([
            duplicateWarning(pbAdmin, selectedWegweiser, 'wegweiser_nr', 'Interne Wegweisernummer'),
            duplicateWarning(pbAdmin, selectedWegweiser, 'offizielle_wegweiser_nr', 'Offizielle Wegweisernummer'),
            duplicateWarning(pbAdmin, selectedWegweiser, 'kataster_wegweiser_nr', 'Kataster-Wegweisernummer')
          ])
        ).filter((warning): warning is DuplicateWarning => warning !== null)
      : [];
    const pfostenContext = selectedWegweiser ? await loadPfostenContext(pbAdmin, selectedWegweiser) : null;

    return {
      wegweiser,
      selectedWegweiser,
      duplicateWarnings,
      pfostenContext,
      statusStats,
      pagination: {
        page: result.page,
        perPage: result.perPage,
        totalItems: result.totalItems,
        totalPages: result.totalPages
      },
      params: { search, sortField, direction, ...filters, selectedId },
      pocketBaseWarning: null
    };
  } catch (error) {
    console.error('Wegweiser-Verwaltung konnte nicht geladen werden.', error);

    return {
      wegweiser: [] satisfies WegweiserAdminItem[],
      selectedWegweiser: null,
      duplicateWarnings: [] satisfies DuplicateWarning[],
      pfostenContext: null,
      statusStats: {
        entwurf: 0,
        bestellt: 0,
        produziert: 0,
        montiert: 0,
        entfernt: 0
      } satisfies StatusStats,
      pagination: { page: 1, perPage, totalItems: 0, totalPages: 1 },
      params: { search, sortField, direction, ...filters, selectedId },
      pocketBaseWarning: 'Wegweiser konnten nicht geladen werden.'
    };
  }
};

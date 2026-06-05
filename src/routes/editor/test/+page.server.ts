import { pictogramOptions, routeOptions } from '$lib/wegweiser';
import type {
  Direction,
  WegweiserDraftListItem,
  WegweiserFormat,
  WegweiserFormatErrorMap
} from '$lib/wegweiser';
import { getPocketBaseFileUrl } from '$lib/server/pocketbase';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';

function stringField(record: RecordModel, fields: string[], fallback = ''): string {
  for (const field of fields) {
    const value = record[field];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function mapPictogramOption(pb: PocketBase, record: RecordModel) {
  const label = stringField(record, ['name', 'label', 'titel', 'bezeichnung'], String(record.id ?? ''));
  const slug = stringField(record, ['slug']);
  const kurzlabel = stringField(record, ['kurzlabel', 'kuerzel', 'code']);
  const kategorie = stringField(record, ['kategorie']);
  const value = slug || stringField(record, ['value', 'code'], label);

  return {
    value,
    label,
    slug: slug || undefined,
    kurzlabel: kurzlabel || undefined,
    kategorie: kategorie || undefined,
    imageUrl: getPocketBaseFileUrl(pb, record, ['svg_datei', 'png_datei'])
  };
}

function mapRouteOption(pb: PocketBase, record: RecordModel) {
  const name = stringField(record, ['name', 'label', 'titel', 'bezeichnung'], String(record.id ?? ''));
  const slug = stringField(record, ['slug']);
  const kurzlabel = stringField(record, ['kurzlabel', 'kuerzel', 'code']);

  return {
    value: slug || name,
    label: name,
    slug: slug || undefined,
    kurzlabel: kurzlabel || undefined,
    imageUrl: getPocketBaseFileUrl(pb, record, ['svg_datei', 'png_datei'])
  };
}

function mapPfostenOption(record: RecordModel) {
  const pfostenKennung = stringField(record, ['pfosten_kennung']);
  const pfostenNr = stringField(record, ['pfosten_nr']);
  const typ = stringField(record, ['typ', 'pfosten_typ']);
  const labelParts = [pfostenKennung || pfostenNr || String(record.id ?? ''), typ].filter(Boolean);

  return {
    value: String(record.id ?? ''),
    label: labelParts.join(' - ')
  };
}

function mapDraft(record: RecordModel): WegweiserDraftListItem {
  return {
    id: String(record.id ?? ''),
    titel: stringField(record, ['titel'], 'Ohne Titel'),
    updated: stringField(record, ['updated']),
    jsonKonfiguration: record.json_konfiguration ?? null,
    wegweiser_nr: stringField(record, ['wegweiser_nr']) || undefined,
    offizielle_wegweiser_nr: stringField(record, ['offizielle_wegweiser_nr']) || undefined,
    kataster_wegweiser_nr: stringField(record, ['kataster_wegweiser_nr']) || undefined,
    pfosten: stringField(record, ['pfosten']) || undefined,
    status: stringField(record, ['status']) as WegweiserDraftListItem['status'] | undefined,
    wegweiser_typ: stringField(record, ['wegweiser_typ']) || undefined,
    richtung: stringField(record, ['richtung']) || undefined
  };
}

function firstStringField(record: RecordModel, fields: string[]): string | null {
  for (const field of fields) {
    const value = record[field];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function firstFileField(record: RecordModel, field: string): string | null {
  const value = record[field];

  if (Array.isArray(value)) {
    const firstFile = value[0];
    return typeof firstFile === 'string' && firstFile.trim() ? firstFile.trim() : null;
  }

  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function inferFormatDirection(record: RecordModel): Direction {
  const direction = stringField(record, ['richtung', 'direction']).toLowerCase();
  const type = stringField(record, ['typ', 'type']).toLowerCase();
  const slug = stringField(record, ['slug']).toLowerCase();

  if ([direction, type, slug].some((value) => value.includes('links') || value.includes('left'))) {
    return 'left';
  }

  return 'right';
}

function mapWegweiserFormatRecord(record: RecordModel, svg = ''): WegweiserFormat {
  const slug = stringField(record, ['slug'], String(record.id ?? ''));

  return {
    id: String(record.id ?? ''),
    slug,
    name: stringField(record, ['name', 'titel', 'bezeichnung'], slug),
    description: firstStringField(record, ['beschreibung', 'description']) ?? undefined,
    direction: inferFormatDirection(record),
    svg
  };
}

async function loadWegweiserFormat(
  pb: PocketBase,
  fetch: typeof globalThis.fetch,
  record: RecordModel
): Promise<{ format: WegweiserFormat | null; error: string | null }> {
  const slug = stringField(record, ['slug'], String(record.id ?? ''));

  try {
    const templateSvg = firstFileField(record, 'template_svg');

    if (!templateSvg) {
      return {
        format: mapWegweiserFormatRecord(record),
        error: `Das PocketBase-Format ${slug} wurde gefunden, aber das Feld template_svg enthält keine SVG-Datei.`
      };
    }

    const fileUrl = pb.files.getURL(record, templateSvg);
    const response = await fetch(fileUrl);

    if (!response.ok) {
      throw new Error(`SVG-Datei konnte nicht geladen werden (${response.status}).`);
    }

    const svg = await response.text();

    if (!svg) {
      return {
        format: mapWegweiserFormatRecord(record),
        error: `Das PocketBase-Format ${slug} wurde gefunden, aber die SVG-Datei ist leer.`
      };
    }

    return {
      format: mapWegweiserFormatRecord(record, svg),
      error: null
    };
  } catch (error) {
    console.error(`PocketBase-Wegweiserformat ${slug} konnte nicht geladen werden.`, error);

    return {
      format: mapWegweiserFormatRecord(record),
      error: `Das PocketBase-Format ${slug} konnte nicht geladen werden. Die Vorschau wird ohne alten Hintergrund nicht angezeigt.`
    };
  }
}

async function loadWegweiserFormats(
  pb: PocketBase,
  fetch: typeof globalThis.fetch
): Promise<{ formats: WegweiserFormat[]; errors: WegweiserFormatErrorMap }> {
  const records = await pb.collection('wegweiser_formate').getFullList<RecordModel>({
    filter:
      'aktiv = true && (wegweiser_typ = "pfeilwegweiser" || wegweiser_typ = "tabellenwegweiser")',
    sort: 'sortierung'
  });
  const entries = await Promise.all(
    records.map(async (record) => ({
      slug: stringField(record, ['slug'], String(record.id ?? '')),
      result: await loadWegweiserFormat(pb, fetch, record)
    }))
  );
  const formats: WegweiserFormat[] = [];
  const errors: WegweiserFormatErrorMap = {};

  for (const { slug, result } of entries) {
    if (result.format) {
      formats.push(result.format);
    }

    if (result.error) {
      errors[slug] = result.error;
    }
  }

  return { formats, errors };
}

export async function load({
  locals,
  fetch,
  url
}: {
  locals: App.Locals;
  fetch: typeof globalThis.fetch;
  url: URL;
}) {
  const pb = locals.pb;
  const pbAdmin = locals.pb;

  if (!pb) {
    return {
      pictogramOptions,
      routeOptions,
      pfostenOptions: [] satisfies Array<{ value: string; label: string }>,
      drafts: [] satisfies WegweiserDraftListItem[],
      wegweiserFormats: [] satisfies WegweiserFormat[],
      wegweiserFormatErrors: {
        pocketbase: 'PocketBase ist nicht konfiguriert. Wegweiser-Formate konnten nicht geladen werden.'
      },
      editorContext: {
        draftId: url.searchParams.get('draft')?.trim() ?? '',
        pfostenId: url.searchParams.get('pfostenId')?.trim() ?? '',
        pfostenKennung: url.searchParams.get('pfosten')?.trim() ?? '',
        knotenId: url.searchParams.get('knotenId')?.trim() ?? ''
      },
      pocketBaseWarning:
        'PocketBase ist nicht konfiguriert. Setze PUBLIC_POCKETBASE_URL, damit Zielpiktogramme und Themenrouten geladen werden.'
    };
  }

  try {
    const [zielPiktogramme, themenrouten, pfosten, entwuerfe, formatResult] = await Promise.all([
      pb.collection('ziel_piktogramme').getFullList<RecordModel>({
        filter: 'aktiv = true',
        sort: 'sortierung'
      }),
      pb.collection('themenrouten').getFullList<RecordModel>({
        filter: 'aktiv = true',
        sort: 'sortierung'
      }),
      pb.collection('pfosten').getFullList<RecordModel>({
        sort: 'pfosten_kennung,pfosten_nr'
      }),
      pbAdmin
        ? pbAdmin.collection('wegweiser_entwuerfe').getFullList<RecordModel>({
            sort: '-updated'
          })
        : Promise.resolve([] as RecordModel[]),
      loadWegweiserFormats(pb, fetch)
    ]);

    return {
      pictogramOptions: [
        pictogramOptions[0],
        ...zielPiktogramme.map((record) => mapPictogramOption(pb, record))
      ],
      routeOptions: themenrouten.map((record) => mapRouteOption(pb, record)),
      pfostenOptions: pfosten.map((record) => mapPfostenOption(record)),
      drafts: entwuerfe.map((record) => mapDraft(record)),
      wegweiserFormats: formatResult.formats,
      wegweiserFormatErrors: formatResult.errors,
      editorContext: {
        draftId: url.searchParams.get('draft')?.trim() ?? '',
        pfostenId: url.searchParams.get('pfostenId')?.trim() ?? '',
        pfostenKennung: url.searchParams.get('pfosten')?.trim() ?? '',
        knotenId: url.searchParams.get('knotenId')?.trim() ?? ''
      },
      pocketBaseWarning: null
    };
  } catch (error) {
    console.error('PocketBase-Stammdaten konnten nicht geladen werden.', error);

    return {
      pictogramOptions,
      routeOptions,
      pfostenOptions: [] satisfies Array<{ value: string; label: string }>,
      drafts: [] satisfies WegweiserDraftListItem[],
      wegweiserFormats: [] satisfies WegweiserFormat[],
      wegweiserFormatErrors: {
        pocketbase:
          'Wegweiser-Formate konnten nicht geladen werden. Die Vorschau wird ohne alten Hintergrund nicht angezeigt.'
      },
      editorContext: {
        draftId: url.searchParams.get('draft')?.trim() ?? '',
        pfostenId: url.searchParams.get('pfostenId')?.trim() ?? '',
        pfostenKennung: url.searchParams.get('pfosten')?.trim() ?? '',
        knotenId: url.searchParams.get('knotenId')?.trim() ?? ''
      },
      pocketBaseWarning:
        'PocketBase-Stammdaten konnten nicht geladen werden. Der Editor läuft mit lokalen Fallback-Daten weiter.'
    };
  }
}

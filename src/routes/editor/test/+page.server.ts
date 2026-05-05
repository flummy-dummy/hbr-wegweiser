import { pictogramOptions, routeOptions } from '$lib/wegweiser';
import type {
  Direction,
  WegweiserDraftListItem,
  WegweiserFormat,
  WegweiserFormatErrorMap,
  WegweiserFormatMap
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

function mapDraft(record: RecordModel): WegweiserDraftListItem {
  return {
    id: String(record.id ?? ''),
    titel: stringField(record, ['titel'], 'Ohne Titel'),
    updated: stringField(record, ['updated']),
    jsonKonfiguration: record.json_konfiguration ?? null
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

async function loadWegweiserFormat(
  pb: PocketBase,
  fetch: typeof globalThis.fetch,
  slug: string
): Promise<{ format: WegweiserFormat | null; error: string | null }> {
  try {
    const record = await pb.collection('wegweiser_formate').getFirstListItem<RecordModel>(`slug = "${slug}"`);
    const templateSvg = firstFileField(record, 'template_svg');

    if (!templateSvg) {
      return {
        format: null,
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
        format: null,
        error: `Das PocketBase-Format ${slug} wurde gefunden, aber die SVG-Datei ist leer.`
      };
    }

    return {
      format: {
        id: String(record.id ?? ''),
        slug: firstStringField(record, ['slug']) ?? slug,
        name: stringField(record, ['name', 'titel', 'bezeichnung'], slug),
        svg
      },
      error: null
    };
  } catch (error) {
    console.error(`PocketBase-Wegweiserformat ${slug} konnte nicht geladen werden.`, error);

    return {
      format: null,
      error: `Das PocketBase-Format ${slug} konnte nicht geladen werden. Die Vorschau wird ohne alten Hintergrund nicht angezeigt.`
    };
  }
}

const wegweiserFormatSlugs: Record<Direction, string> = {
  right: 'pfeilwegweiser_rechts',
  left: 'pfeilwegweiser_links'
};

async function loadWegweiserFormats(
  pb: PocketBase,
  fetch: typeof globalThis.fetch
): Promise<{ formats: WegweiserFormatMap; errors: WegweiserFormatErrorMap }> {
  const entries = await Promise.all(
    Object.entries(wegweiserFormatSlugs).map(async ([direction, slug]) => {
      const result = await loadWegweiserFormat(pb, fetch, slug);

      return [direction as Direction, result] as const;
    })
  );
  const formats: WegweiserFormatMap = {};
  const errors: WegweiserFormatErrorMap = {};

  for (const [direction, result] of entries) {
    if (result.format) {
      formats[direction] = result.format;
    }

    if (result.error) {
      errors[direction] = result.error;
    }
  }

  return { formats, errors };
}

export async function load({ locals, fetch }: { locals: App.Locals; fetch: typeof globalThis.fetch }) {
  const pb = locals.pb;
  const pbAdmin = locals.pb;

  if (!pb) {
    return {
      pictogramOptions,
      routeOptions,
      drafts: [] satisfies WegweiserDraftListItem[],
      wegweiserFormats: {},
      wegweiserFormatErrors: {
        right: 'PocketBase ist nicht konfiguriert. Das Format pfeilwegweiser_rechts konnte nicht geladen werden.',
        left: 'PocketBase ist nicht konfiguriert. Das Format pfeilwegweiser_links konnte nicht geladen werden.'
      },
      pocketBaseWarning:
        'PocketBase ist nicht konfiguriert. Setze PUBLIC_POCKETBASE_URL, damit Zielpiktogramme und Themenrouten geladen werden.'
    };
  }

  try {
    const [zielPiktogramme, themenrouten, entwuerfe, formatResult] = await Promise.all([
      pb.collection('ziel_piktogramme').getFullList<RecordModel>({
        filter: 'aktiv = true',
        sort: 'sortierung'
      }),
      pb.collection('themenrouten').getFullList<RecordModel>({
        filter: 'aktiv = true',
        sort: 'sortierung'
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
      drafts: entwuerfe.map((record) => mapDraft(record)),
      wegweiserFormats: formatResult.formats,
      wegweiserFormatErrors: formatResult.errors,
      pocketBaseWarning: null
    };
  } catch (error) {
    console.error('PocketBase-Stammdaten konnten nicht geladen werden.', error);

    return {
      pictogramOptions,
      routeOptions,
      drafts: [] satisfies WegweiserDraftListItem[],
      wegweiserFormats: {},
      wegweiserFormatErrors: {
        right:
          'Das PocketBase-Format pfeilwegweiser_rechts konnte nicht geladen werden. Die Vorschau wird ohne alten Hintergrund nicht angezeigt.',
        left:
          'Das PocketBase-Format pfeilwegweiser_links konnte nicht geladen werden. Die Vorschau wird ohne alten Hintergrund nicht angezeigt.'
      },
      pocketBaseWarning:
        'PocketBase-Stammdaten konnten nicht geladen werden. Der Editor läuft mit lokalen Fallback-Daten weiter.'
    };
  }
}

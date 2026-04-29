import { pictogramOptions, routeOptions } from '$lib/wegweiser';
import type { WegweiserDraftListItem } from '$lib/wegweiser';
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

export async function load({ locals }: { locals: App.Locals }) {
  const pb = locals.pb;
  const pbAdmin = locals.pb;

  if (!pb) {
    return {
      pictogramOptions,
      routeOptions,
      drafts: [] satisfies WegweiserDraftListItem[],
      pocketBaseWarning:
        'PocketBase ist nicht konfiguriert. Setze PUBLIC_POCKETBASE_URL, damit Zielpiktogramme und Themenrouten geladen werden.'
    };
  }

  try {
    const [zielPiktogramme, themenrouten, entwuerfe] = await Promise.all([
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
        : Promise.resolve([] as RecordModel[])
    ]);

    return {
      pictogramOptions: [
        pictogramOptions[0],
        ...zielPiktogramme.map((record) => mapPictogramOption(pb, record))
      ],
      routeOptions: themenrouten.map((record) => mapRouteOption(pb, record)),
      drafts: entwuerfe.map((record) => mapDraft(record)),
      pocketBaseWarning: null
    };
  } catch (error) {
    console.error('PocketBase-Stammdaten konnten nicht geladen werden.', error);

    return {
      pictogramOptions,
      routeOptions,
      drafts: [] satisfies WegweiserDraftListItem[],
      pocketBaseWarning:
        'PocketBase-Stammdaten konnten nicht geladen werden. Der Editor läuft mit lokalen Fallback-Daten weiter.'
    };
  }
}

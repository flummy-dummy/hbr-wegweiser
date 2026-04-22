import { pictogramOptions, routeOptions } from '$lib/wegweiser';
import { createPocketBaseClient, getPocketBaseFileUrl } from '$lib/server/pocketbase';
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

export async function load() {
  const pb = createPocketBaseClient();

  try {
    const [zielPiktogramme, themenrouten] = await Promise.all([
      pb.collection('ziel_piktogramme').getFullList<RecordModel>({
        filter: 'aktiv = true',
        sort: 'sortierung'
      }),
      pb.collection('themenrouten').getFullList<RecordModel>({
        filter: 'aktiv = true',
        sort: 'sortierung'
      })
    ]);

    return {
      pictogramOptions: [
        pictogramOptions[0],
        ...zielPiktogramme.map((record) => mapPictogramOption(pb, record))
      ],
      routeOptions: themenrouten.map((record) => mapRouteOption(pb, record))
    };
  } catch (error) {
    console.error('PocketBase-Stammdaten konnten nicht geladen werden.', error);

    return {
      pictogramOptions,
      routeOptions
    };
  }
}

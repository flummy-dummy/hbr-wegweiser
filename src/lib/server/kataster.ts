import { createPocketBaseClient } from '$lib/server/pocketbase';
import type { GeoJsonGeometry, KatasterCollectionType, KatasterMapRecord } from '$lib/kataster';
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

function numberField(record: RecordModel, field: string): number | null {
  const value = record[field];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseGeomJson(value: unknown): GeoJsonGeometry | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed ? (parsed as GeoJsonGeometry) : null;
    } catch {
      return null;
    }
  }

  return typeof value === 'object' ? (value as GeoJsonGeometry) : null;
}

function mapKatasterRecord(
  collection: KatasterCollectionType,
  record: RecordModel
): KatasterMapRecord {
  if (collection === 'knoten') {
    return {
      id: String(record.id ?? ''),
      collection,
      title: stringField(record, ['bezeichnung', 'knoten_nr'], 'Knoten'),
      subtitle: stringField(record, ['knoten_nr']),
      status: stringField(record, ['status']),
      geomJson: parseGeomJson(record.geom_json),
      lon: numberField(record, 'lon'),
      lat: numberField(record, 'lat')
    };
  }

  if (collection === 'pfosten') {
    return {
      id: String(record.id ?? ''),
      collection,
      title: stringField(record, ['pfosten_nr', 'typ'], 'Pfosten'),
      subtitle: stringField(record, ['typ']),
      status: stringField(record, ['bestand_status']),
      geomJson: parseGeomJson(record.geom_json),
      lon: numberField(record, 'lon'),
      lat: numberField(record, 'lat')
    };
  }

  return {
    id: String(record.id ?? ''),
    collection,
    title: stringField(record, ['kanten_nr'], 'Kante'),
    subtitle: stringField(record, ['art']),
    status: stringField(record, ['status']),
    geomJson: parseGeomJson(record.geom_json),
    lon: null,
    lat: null
  };
}

export async function loadKatasterMapData(): Promise<{
  knoten: KatasterMapRecord[];
  pfosten: KatasterMapRecord[];
  kanten: KatasterMapRecord[];
  pocketBaseWarning: string | null;
}> {
  const pb = createPocketBaseClient();

  if (!pb) {
    return {
      knoten: [],
      pfosten: [],
      kanten: [],
      pocketBaseWarning:
        'PocketBase ist nicht konfiguriert. Setze PUBLIC_POCKETBASE_URL, damit Katasterdaten geladen werden koennen.'
    };
  }

  try {
    const [knoten, pfosten, kanten] = await Promise.all([
      pb.collection('knoten').getFullList<RecordModel>({ sort: 'knoten_nr,bezeichnung' }),
      pb.collection('pfosten').getFullList<RecordModel>({ sort: 'pfosten_nr' }),
      pb.collection('kanten').getFullList<RecordModel>({ sort: 'kanten_nr' })
    ]);

    return {
      knoten: knoten.map((record) => mapKatasterRecord('knoten', record)),
      pfosten: pfosten.map((record) => mapKatasterRecord('pfosten', record)),
      kanten: kanten.map((record) => mapKatasterRecord('kanten', record)),
      pocketBaseWarning: null
    };
  } catch (error) {
    console.error('Katasterdaten konnten nicht aus PocketBase geladen werden.', error);

    return {
      knoten: [],
      pfosten: [],
      kanten: [],
      pocketBaseWarning:
        'Katasterdaten konnten nicht geladen werden. Die Karte startet ohne PocketBase-Daten.'
    };
  }
}

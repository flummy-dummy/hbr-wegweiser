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
      lat: numberField(record, 'lat'),
      formData: {
        knotenNr: stringField(record, ['knoten_nr']),
        bezeichnung: stringField(record, ['bezeichnung']),
        bemerkung: stringField(record, ['bemerkung']),
        aktiv: record.aktiv === true,
        knotenpunktNr: numberField(record, 'knotenpunkt_nr')
      }
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
    lat: null,
    formData: {
      kantenNr: stringField(record, ['kanten_nr']),
      bemerkung: stringField(record, ['bemerkung']),
      aktiv: record.aktiv === true,
      kantenArt: stringField(record, ['art']),
      kantenLinienstil: stringField(record, ['linienstil']),
      startKnotenId: stringField(record, ['start_knoten']),
      endKnotenId: stringField(record, ['end_knoten'])
    }
  };
}

export async function loadKatasterMapData(): Promise<{
  knoten: KatasterMapRecord[];
  pfosten: KatasterMapRecord[];
  kanten: KatasterMapRecord[];
  themenrouten: KatasterMapRecord[];
  knotenpunktverbindungen: KatasterMapRecord[];
  pocketBaseWarning: string | null;
}> {
  const pb = createPocketBaseClient();

  if (!pb) {
    return {
      knoten: [],
      pfosten: [],
      kanten: [],
      themenrouten: [],
      knotenpunktverbindungen: [],
      pocketBaseWarning:
        'PocketBase ist nicht konfiguriert. Setze PUBLIC_POCKETBASE_URL, damit Katasterdaten geladen werden koennen.'
    };
  }

  try {
    const [knoten, pfosten, kanten, themenrouten, themenrouteKanten, verbindungen, verbindungKanten] = await Promise.all([
      pb.collection('knoten').getFullList<RecordModel>({ sort: 'knoten_nr,bezeichnung' }),
      pb.collection('pfosten').getFullList<RecordModel>({ sort: 'pfosten_nr' }),
      pb.collection('kanten').getFullList<RecordModel>({ sort: 'kanten_nr' }),
      pb.collection('themenrouten').getFullList<RecordModel>({ sort: 'sortierung,name' }),
      pb.collection('themenroute_kanten').getFullList<RecordModel>({ sort: 'sortierung' }),
      pb.collection('knotenpunktverbindungen').getFullList<RecordModel>({ sort: 'verbindung_nr,bezeichnung' }),
      pb.collection('knotenpunktverbindung_kanten').getFullList<RecordModel>({ sort: 'sortierung' })
    ]);

    const kantenById = new Map(
      kanten.map((record) => [String(record.id ?? ''), mapKatasterRecord('kanten', record)])
    );
    const themenroutenById = new Map(
      themenrouten.map((record) => [
        String(record.id ?? ''),
        {
          id: String(record.id ?? ''),
          name: stringField(record, ['name'], 'Themenroute'),
          slug: stringField(record, ['slug']),
          status: stringField(record, ['status']),
          color: stringField(record, ['farbe_rahmen'])
        }
      ])
    );
    const verbindungenById = new Map(
      verbindungen.map((record) => [
        String(record.id ?? ''),
        {
          id: String(record.id ?? ''),
          nummer: stringField(record, ['verbindung_nr']),
          bezeichnung: stringField(record, ['bezeichnung']),
          status: stringField(record, ['status']),
          typ: stringField(record, ['verbindungs_typ'])
        }
      ])
    );

    const themenroutenFeatures: KatasterMapRecord[] = themenrouteKanten
      .flatMap((record) => {
        const routeId = stringField(record, ['themenroute']);
        const kanteId = stringField(record, ['kante']);
        const routeMeta = themenroutenById.get(routeId);
        const kanteMeta = kantenById.get(kanteId);

        if (!routeMeta || !kanteMeta?.geomJson) {
          return [];
        }

        return [
          {
            id: `${routeId}:${kanteId}`,
            collection: 'themenroute' as KatasterCollectionType,
            title: routeMeta.name,
            subtitle: routeMeta.slug || kanteMeta.title,
            status: stringField(record, ['status']) || routeMeta.status,
            groupKey: routeId,
            color: routeMeta.color || undefined,
            geomJson: kanteMeta.geomJson,
            lon: null,
            lat: null
          }
        ];
      });

    const knotenpunktverbindungenFeatures: KatasterMapRecord[] = verbindungKanten
      .flatMap((record) => {
        const verbindungId = stringField(record, ['verbindung']);
        const kanteId = stringField(record, ['kante']);
        const verbindungMeta = verbindungenById.get(verbindungId);
        const kanteMeta = kantenById.get(kanteId);

        if (!verbindungMeta || !kanteMeta?.geomJson) {
          return [];
        }

        return [
          {
            id: `${verbindungId}:${kanteId}`,
            collection: 'knotenpunktverbindung' as KatasterCollectionType,
            title: verbindungMeta.bezeichnung || verbindungMeta.nummer || 'Knotenpunktverbindung',
            subtitle: verbindungMeta.nummer || verbindungMeta.typ || undefined,
            status: verbindungMeta.status,
            groupKey: verbindungId,
            geomJson: kanteMeta.geomJson,
            lon: null,
            lat: null
          }
        ];
      });

    return {
      knoten: knoten.map((record) => mapKatasterRecord('knoten', record)),
      pfosten: pfosten.map((record) => mapKatasterRecord('pfosten', record)),
      kanten: [...kantenById.values()],
      themenrouten: themenroutenFeatures,
      knotenpunktverbindungen: knotenpunktverbindungenFeatures,
      pocketBaseWarning: null
    };
  } catch (error) {
    console.error('Katasterdaten konnten nicht aus PocketBase geladen werden.', error);

    return {
      knoten: [],
      pfosten: [],
      kanten: [],
      themenrouten: [],
      knotenpunktverbindungen: [],
      pocketBaseWarning:
        'Katasterdaten konnten nicht geladen werden. Die Karte startet ohne PocketBase-Daten.'
    };
  }
}

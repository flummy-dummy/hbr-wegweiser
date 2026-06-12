import { createPocketBaseClient } from '$lib/server/pocketbase';
import { gradZuHimmelsrichtung, normalizeHimmelsrichtungGrad } from '$lib/utils/himmelsrichtung';
import type {
  GeoJsonGeometry,
  KatasterCollectionType,
  KatasterMapRecord,
  KatasterWegweiserInfo
} from '$lib/kataster';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';

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

function officialKnotenNrField(record: RecordModel, fields: string[], fallback = ''): string {
  for (const field of fields) {
    const value = record[field];
    const normalized =
      typeof value === 'number' && Number.isFinite(value)
        ? String(Math.trunc(value))
        : typeof value === 'string'
          ? value.trim()
          : '';

    if (/^[1-9]\d{6,8}$/.test(normalized)) {
      return normalized;
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

function formatDistance(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value.toLocaleString('de-DE')} km`;
  }

  if (typeof value === 'string' && value.trim()) {
    return `${value.trim()} km`;
  }

  return '';
}

function targetText(record: RecordModel, textField: string, distanceField: string): string {
  const text = stringField(record, [textField]);
  const distance = formatDistance(record[distanceField]);

  if (!text) {
    return '';
  }

  return distance ? `${text} (${distance})` : text;
}

function mapWegweiserInfo(record: RecordModel): KatasterWegweiserInfo & { pfostenId: string } {
  const title = stringField(record, ['titel', 'wegweiser_nr'], 'Wegweiser');
  const himmelsrichtungGrad = normalizeHimmelsrichtungGrad(record.himmelsrichtung_grad);
  const ziele = [
    targetText(record, 'ziel_oben_text', 'ziel_oben_entfernung') ||
      targetText(record, 'fernziel_text', 'fernziel_entfernung'),
    targetText(record, 'ziel_unten_text', 'ziel_unten_entfernung') ||
      targetText(record, 'nahziel_text', 'nahziel_entfernung')
  ].filter(Boolean);

  return {
    id: String(record.id ?? ''),
    pfostenId: relationIdField(record, 'pfosten'),
    title,
    wegweiser_nr: stringField(record, ['wegweiser_nr']) || undefined,
    offizielle_wegweiser_nr: stringField(record, ['offizielle_wegweiser_nr']) || undefined,
    kataster_wegweiser_nr: stringField(record, ['kataster_wegweiser_nr']) || undefined,
    status: stringField(record, ['status']) || undefined,
    wegweiser_typ: stringField(record, ['wegweiser_typ']) || undefined,
    richtung: stringField(record, ['richtung']) || undefined,
    himmelsrichtungGrad,
    himmelsrichtungText: stringField(record, ['himmelsrichtung_text']) || gradZuHimmelsrichtung(himmelsrichtungGrad),
    darstellungsAbstand: numberField(record, 'darstellungs_abstand') ?? undefined,
    seitlicherVersatz: numberField(record, 'seitlicher_versatz') ?? undefined,
    anzeigeReihenfolge: numberField(record, 'anzeige_reihenfolge') ?? undefined,
    ziele
  };
}

function mapKatasterRecord(
  collection: KatasterCollectionType,
  record: RecordModel,
  options: {
    knotenById?: Map<string, KatasterMapRecord>;
  } = {}
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
        kreis: stringField(record, ['kreis']),
        kommune: stringField(record, ['kommune']),
        katasterkennung: stringField(record, ['katasterkennung']),
        knotenKennung: stringField(record, ['knoten_kennung', 'katasterkennung_knoten', 'katasterkennung']),
        pfostenKennung: stringField(record, ['pfosten_kennung']),
        pfostenNr: stringField(record, ['pfosten_nr']),
        nrwPoiNr: stringField(record, ['nrw_poi_nr']),
        nrwTyp: stringField(record, ['nrw_typ']),
        nrwKommune: stringField(record, ['nrw_kommune']),
        nrwSourceUrl: stringField(record, ['nrw_source_url']),
        nrwRawValue: stringField(record, ['nrw_raw_value']),
        nrwObjectId: stringField(record, ['nrw_object_id']),
        offizielleKnotenNr: officialKnotenNrField(record, ['offizielle_knoten_nr']),
        bemerkung: stringField(record, ['bemerkung']),
        aktiv: record.aktiv === true,
        knotenpunktNr: numberField(record, 'knotenpunkt_nr')
      }
    };
  }

  if (collection === 'pfosten') {
    const linkedKnotenId = relationIdField(record, 'knoten');
    const fallbackKnoten = linkedKnotenId ? options.knotenById?.get(linkedKnotenId) : null;
    const geomJson = parseGeomJson(record.geom_json);
    const lon = numberField(record, 'lon');
    const lat = numberField(record, 'lat');
    // TODO NRW-PFOSTEN-GEOMETRIE: Wenn ein Pfosten noch keine eigene Geometrie hat,
    // wird vorlaeufig die Knotenposition verwendet, damit er als eigenes Objekt sichtbar ist.
    const fallbackGeomJson = geomJson ?? fallbackKnoten?.geomJson ?? null;

    return {
      id: String(record.id ?? ''),
      collection,
      title: stringField(record, ['pfosten_kennung', 'pfosten_nr', 'typ'], 'Pfosten'),
      subtitle: stringField(record, ['pfosten_nr', 'pfosten_index', 'typ']),
      status: stringField(record, ['bestand_status']),
      geomJson: fallbackGeomJson,
      lon: lon ?? fallbackKnoten?.lon ?? null,
      lat: lat ?? fallbackKnoten?.lat ?? null,
      formData: {
        linkedKnotenId,
        pfostenKennung: stringField(record, ['pfosten_kennung']),
        pfostenNr: stringField(record, ['pfosten_nr']),
        pfostenIndex: numberField(record, 'pfosten_index'),
        pfostenTyp: stringField(record, ['pfosten_typ', 'typ']),
        pfostenMaterial: stringField(record, ['material']),
        pfostenFotoKennung: stringField(record, ['pfosten_foto_kennung', 'foto_kennung']),
        nrwRawValue: stringField(record, ['nrw_raw_value']),
        nrwObjectId: stringField(record, ['nrw_object_id']),
        bemerkung: stringField(record, ['bemerkung']),
        aktiv: record.aktiv === true
      }
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

export async function loadKatasterMapData(pb: PocketBase | null = createPocketBaseClient()): Promise<{
  knoten: KatasterMapRecord[];
  pfosten: KatasterMapRecord[];
  wegweiser: KatasterWegweiserInfo[];
  kanten: KatasterMapRecord[];
  themenrouten: KatasterMapRecord[];
  knotenpunktverbindungen: KatasterMapRecord[];
  pocketBaseWarning: string | null;
}> {
  if (!pb) {
    return {
      knoten: [],
      pfosten: [],
      wegweiser: [],
      kanten: [],
      themenrouten: [],
      knotenpunktverbindungen: [],
      pocketBaseWarning:
        'PocketBase ist nicht konfiguriert. Setze PUBLIC_POCKETBASE_URL, damit Katasterdaten geladen werden koennen.'
    };
  }

  try {
    const [knoten, pfosten, wegweiserEntwuerfe, kanten, themenrouten, themenrouteKanten, verbindungen, verbindungKanten] = await Promise.all([
      pb.collection('knoten').getFullList<RecordModel>({ sort: 'knoten_nr,bezeichnung' }),
      pb.collection('pfosten').getFullList<RecordModel>({ sort: 'pfosten_index,pfosten_nr' }),
      pb.collection('wegweiser_entwuerfe').getFullList<RecordModel>({ sort: 'wegweiser_nr,titel' }),
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

    const mappedKnoten = knoten.map((record) => mapKatasterRecord('knoten', record));
    const knotenById = new Map(mappedKnoten.map((record) => [record.id, record]));
    const wegweiserByPfostenId = new Map<string, KatasterWegweiserInfo[]>();
    const mappedWegweiser = wegweiserEntwuerfe.map((record) => mapWegweiserInfo(record));

    for (const wegweiserInfo of mappedWegweiser) {
      if (!wegweiserInfo.pfostenId) {
        continue;
      }

      const entries = wegweiserByPfostenId.get(wegweiserInfo.pfostenId) ?? [];
      entries.push(wegweiserInfo);
      wegweiserByPfostenId.set(wegweiserInfo.pfostenId, entries);
    }

    const mappedPfosten = pfosten.map((record) => {
      const mapped = mapKatasterRecord('pfosten', record, { knotenById });
      return {
        ...mapped,
        relatedWegweiser: wegweiserByPfostenId.get(mapped.id) ?? []
      };
    });

    return {
      knoten: mappedKnoten,
      pfosten: mappedPfosten,
      wegweiser: mappedWegweiser,
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
      wegweiser: [],
      kanten: [],
      themenrouten: [],
      knotenpunktverbindungen: [],
      pocketBaseWarning:
        'Katasterdaten konnten nicht geladen werden. Die Karte startet ohne PocketBase-Daten.'
    };
  }
}

import { ensurePermission } from '$lib/server/auth';
import { loadKatasterMapData } from '$lib/server/kataster';
import { error, fail } from '@sveltejs/kit';
import PocketBase, { type RecordModel } from 'pocketbase';
import type { Actions, PageServerLoad } from './$types';

type PocketBaseClient = PocketBase;
type RecordPayload = Record<string, unknown>;
type SubmittedNrwPfosten = {
  pfostenKennung: string;
  pfostenNr: string;
  nrwRawValue: string;
  nrwObjectId: string;
  lon: number | null;
  lat: number | null;
};

const KNOWN_COLLECTION_FIELDS: Record<string, Set<string>> = {
  pfosten: new Set([
    'knoten',
    'pfosten_index',
    'pfosten_kennung',
    'pfosten_nr',
    'nrw_raw_value',
    'nrw_object_id',
    'bestand_status',
    'typ',
    'pfosten_typ',
    'bemerkung',
    'material',
    'aktiv',
    'geom_typ',
    'geom_json',
    'lon',
    'lat'
  ])
};

export const load: PageServerLoad = async ({ locals }) => {
  return await loadKatasterMapData(locals.pb);
};

function formValue(values: FormData, field: string): string {
  const value = values.get(field);
  return typeof value === 'string' ? value.trim() : '';
}

function parseNumberInput(raw: string): number | null {
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveIntegerInput(raw: string): number | null {
  const parsed = parseNumberInput(raw);
  return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function createPfostenKennung(knotenKennung: string, pfostenIndex: number): string {
  return knotenKennung ? `${knotenKennung}-${pfostenIndex}` : '';
}

function normalizeOfficialKnotenNr(value: string): string {
  const normalized = value.trim();
  return /^[1-9]\d{6,8}$/.test(normalized) ? normalized : '';
}

function normalizeNrwKnotenKennung(value: string): string {
  const normalized = value.trim().toUpperCase();
  return /^[A-ZÄÖÜ]{1,4}\d{2,4}$/u.test(normalized) ? normalized : '';
}

function describePocketBaseError(error: unknown, fallback: string): string {
  const response = error as {
    message?: string;
    response?: {
      message?: string;
      data?: Record<string, { message?: string; code?: string } | string>;
    };
    data?: Record<string, { message?: string; code?: string } | string>;
  };
  const data = response.response?.data ?? response.data;
  const fieldMessages = data
    ? Object.entries(data).flatMap(([field, detail]) => {
        if (typeof detail === 'string') {
          return [`${field}: ${detail}`];
        }

        if (detail?.message) {
          return [`${field}: ${detail.message}`];
        }

        if (detail?.code) {
          return [`${field}: ${detail.code}`];
        }

        return [];
      })
    : [];
  const message = response.response?.message ?? response.message;

  if (fieldMessages.length) {
    return `${fallback} ${fieldMessages.join('; ')}`;
  }

  return message ? `${fallback} ${message}` : fallback;
}

function logPocketBaseErrorDetails(context: string, error: unknown): void {
  const pbError = error as {
    response?: unknown;
    originalError?: { data?: unknown };
    cause?: { data?: unknown };
  };

  console.error(`${context} response`, JSON.stringify(pbError.response ?? null, null, 2));
  console.error(`${context} originalError.data`, JSON.stringify(pbError.originalError?.data ?? null, null, 2));
  console.error(`${context} cause.data`, JSON.stringify(pbError.cause?.data ?? null, null, 2));
}

function logPfostenPayload(payload: RecordPayload): void {
  console.log('Pfosten payload', JSON.stringify(payload, null, 2));
}

async function getCollectionFieldNames(pb: PocketBaseClient, collectionName: string): Promise<Set<string> | null> {
  try {
    const collection = (await pb.collections.getOne(collectionName)) as {
      fields?: Array<{ name?: unknown }>;
      schema?: Array<{ name?: unknown }>;
    };
    const fields = Array.isArray(collection.fields) ? collection.fields : collection.schema;

    if (!Array.isArray(fields)) {
      return null;
    }

    return new Set(
      fields.flatMap((field) => (typeof field.name === 'string' && field.name.trim() ? [field.name.trim()] : []))
    );
  } catch (error) {
    const status = (error as { status?: number })?.status;

    if (status === 403) {
      console.debug(
        `PocketBase-Felder fuer ${collectionName} konnten wegen 403 nicht gelesen werden. Bekanntes Feldmapping wird verwendet.`
      );
      return KNOWN_COLLECTION_FIELDS[collectionName] ?? null;
    }

    console.warn(
      `PocketBase-Felder fuer ${collectionName} konnten nicht gelesen werden. Bekanntes Feldmapping wird verwendet.`,
      error
    );
    return KNOWN_COLLECTION_FIELDS[collectionName] ?? null;
  }
}

function filterPayloadByCollectionFields(payload: RecordPayload, fieldNames: Set<string> | null): RecordPayload {
  if (!fieldNames) {
    return payload;
  }

  return Object.fromEntries(Object.entries(payload).filter(([field]) => fieldNames.has(field)));
}

function getRemovedPayloadFields(payload: RecordPayload, filteredPayload: RecordPayload): string[] {
  return Object.keys(payload).filter((field) => !(field in filteredPayload));
}

async function createRecordWithSchemaFallback(
  pb: PocketBaseClient,
  collectionName: string,
  payload: RecordPayload
): Promise<RecordModel> {
  try {
    if (collectionName === 'pfosten') {
      logPfostenPayload(payload);
    }
    return await pb.collection(collectionName).create(payload);
  } catch (error) {
    logPocketBaseErrorDetails(`PocketBase-Create ${collectionName}`, error);
    const fieldNames = await getCollectionFieldNames(pb, collectionName);
    const filteredPayload = filterPayloadByCollectionFields(payload, fieldNames);
    const removedFields = getRemovedPayloadFields(payload, filteredPayload);

    if (!fieldNames || removedFields.length === 0) {
      throw error;
    }

    console.warn(`PocketBase-Create fuer ${collectionName} wird ohne unbekannte Felder wiederholt.`, {
      removedFields
    });

    if (collectionName === 'pfosten') {
      logPfostenPayload(filteredPayload);
    }
    return await pb.collection(collectionName).create(filteredPayload);
  }
}

async function updateRecordWithSchemaFallback(
  pb: PocketBaseClient,
  collectionName: string,
  id: string,
  payload: RecordPayload
): Promise<RecordModel> {
  try {
    if (collectionName === 'pfosten') {
      logPfostenPayload(payload);
    }
    return await pb.collection(collectionName).update(id, payload);
  } catch (error) {
    logPocketBaseErrorDetails(`PocketBase-Update ${collectionName}`, error);
    const fieldNames = await getCollectionFieldNames(pb, collectionName);
    const filteredPayload = filterPayloadByCollectionFields(payload, fieldNames);
    const removedFields = getRemovedPayloadFields(payload, filteredPayload);

    if (!fieldNames || removedFields.length === 0) {
      throw error;
    }

    console.warn(`PocketBase-Update fuer ${collectionName} wird ohne unbekannte Felder wiederholt.`, {
      removedFields
    });

    if (collectionName === 'pfosten') {
      logPfostenPayload(filteredPayload);
    }
    return await pb.collection(collectionName).update(id, filteredPayload);
  }
}

function parseSubmittedNrwPfosten(rawValue: string, knotenKennung: string): SubmittedNrwPfosten[] {
  const entries: unknown[] = [];

  if (rawValue) {
    try {
      const parsed = JSON.parse(rawValue);

      if (Array.isArray(parsed)) {
        entries.push(...parsed);
      }
    } catch {
      // Ungueltige Zusatzdaten werden ignoriert; der Knoten kann trotzdem gespeichert werden.
    }
  }

  const result = new Map<string, SubmittedNrwPfosten>();

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const candidate = entry as Record<string, unknown>;
    const pfostenKennung =
      typeof candidate.pfostenKennung === 'string' ? candidate.pfostenKennung.trim() : '';
    const match = pfostenKennung.match(/^([A-ZÄÖÜ]{1,4}\d{2,4})-(\d+)$/u);

    if (!match || match[1] !== knotenKennung) {
      continue;
    }

    result.set(pfostenKennung, {
      pfostenKennung,
      pfostenNr: match[2],
      nrwRawValue:
        typeof candidate.nrwRawValue === 'string'
          ? candidate.nrwRawValue.trim()
          : typeof candidate.rawValue === 'string'
            ? candidate.rawValue.trim()
            : '',
      nrwObjectId:
        typeof candidate.nrwObjectId === 'string'
          ? candidate.nrwObjectId.trim()
          : typeof candidate.objectId === 'string'
            ? candidate.objectId.trim()
            : '',
      lon: typeof candidate.lon === 'number' && Number.isFinite(candidate.lon) ? candidate.lon : null,
      lat: typeof candidate.lat === 'number' && Number.isFinite(candidate.lat) ? candidate.lat : null
    });
  }

  return Array.from(result.values());
}

async function createMissingNrwPfosten(
  pb: PocketBaseClient,
  knotenId: string,
  candidates: SubmittedNrwPfosten[]
): Promise<{ created: string[]; existing: string[]; missingCoordinates: string[] }> {
  const created: string[] = [];
  const existing: string[] = [];
  const missingCoordinates: string[] = [];

  console.log('NRW-Kataster: Automatische Pfostenanlage gestartet.', {
    knotenId,
    candidateCount: candidates.length,
    candidates: candidates.map((candidate) => candidate.pfostenKennung)
  });

  for (const candidate of candidates) {
    if (
      candidate.lon === null ||
      candidate.lat === null ||
      candidate.lon < -180 ||
      candidate.lon > 180 ||
      candidate.lat < -90 ||
      candidate.lat > 90
    ) {
      missingCoordinates.push(candidate.pfostenKennung);
      console.log('NRW-Kataster: Pfosten wegen fehlender eigener Koordinate uebersprungen.', {
        knotenId,
        pfostenKennung: candidate.pfostenKennung,
        lon: candidate.lon,
        lat: candidate.lat
      });
      continue;
    }

    try {
      await pb.collection('pfosten').getFirstListItem<RecordModel>(
        pb.filter('pfosten_kennung = {:pfostenKennung}', {
          pfostenKennung: candidate.pfostenKennung
        })
      );
      existing.push(candidate.pfostenKennung);
      console.log('NRW-Kataster: Bereits vorhandener Pfosten uebersprungen.', {
        knotenId,
        pfostenKennung: candidate.pfostenKennung
      });
      continue;
    } catch (error) {
      if ((error as { status?: number })?.status !== 404) {
        throw error;
      }
    }

    const payload = {
      knoten: knotenId,
      pfosten_index: Number(candidate.pfostenNr),
      pfosten_kennung: candidate.pfostenKennung,
      pfosten_nr: candidate.pfostenKennung,
      nrw_raw_value: candidate.nrwRawValue,
      nrw_object_id: candidate.nrwObjectId,
      bestand_status: 'vorhanden',
      typ: 'bestandsmast',
      bemerkung: 'Automatisch aus NRW-Katasterdaten angelegt.',
      material: 'metall',
      aktiv: true,
      geom_typ: 'Point',
      geom_json: {
        type: 'Point',
        coordinates: [candidate.lon, candidate.lat]
      },
      lon: candidate.lon,
      lat: candidate.lat
    };

    console.log('NRW-Kataster: Automatischer Pfosten-Create-Payload.', JSON.stringify(payload, null, 2));
    const createdRecord = await createRecordWithSchemaFallback(pb, 'pfosten', payload);
    console.log('NRW-Kataster: Automatischer Pfosten in PocketBase angelegt.', {
      knotenId,
      pfostenId: String(createdRecord.id ?? ''),
      pfostenKennung: candidate.pfostenKennung,
      relationKnoten: String(createdRecord.knoten ?? knotenId)
    });
    created.push(candidate.pfostenKennung);
  }

  return { created, existing, missingCoordinates };
}

async function createOrUpdatePfostenByKennung(
  pb: PocketBaseClient,
  pfostenKennung: string,
  payload: RecordPayload
): Promise<'created' | 'updated'> {
  if (pfostenKennung) {
    try {
      const existingPfosten = await pb.collection('pfosten').getFirstListItem<RecordModel>(
        pb.filter('pfosten_kennung = {:pfostenKennung}', { pfostenKennung })
      );

      if (existingPfosten?.id) {
        await updateRecordWithSchemaFallback(pb, 'pfosten', existingPfosten.id, payload);
        return 'updated';
      }
    } catch (error) {
      if ((error as { status?: number })?.status !== 404) {
        throw error;
      }
    }
  }

  await createRecordWithSchemaFallback(pb, 'pfosten', payload);
  return 'created';
}

function getKnotenKennung(record: RecordModel): string {
  for (const field of ['knoten_kennung', 'katasterkennung_knoten', 'katasterkennung', 'knoten_nr']) {
    const value = record[field];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

async function getNextPfostenIndex(pb: PocketBaseClient, knotenId: string): Promise<number> {
  const records = await pb.collection('pfosten').getFullList<RecordModel>({
    filter: pb.filter('knoten = {:knotenId}', { knotenId })
  });
  const indexes = records
    .map((record) => parsePositiveIntegerInput(String(record.pfosten_index ?? record.pfosten_nr ?? '')))
    .filter((value): value is number => value !== null);

  return Math.max(0, ...indexes) + 1;
}

async function ensurePfostenKennungIsAvailable(
  pb: PocketBaseClient,
  pfostenKennung: string,
  currentId = ''
): Promise<void> {
  if (!pfostenKennung) {
    return;
  }

  try {
    const existing = await pb.collection('pfosten').getFirstListItem<RecordModel>(
      pb.filter('pfosten_kennung = {:pfostenKennung}', { pfostenKennung })
    );

    if (existing?.id && existing.id !== currentId) {
      throw new Error(`Pfostenkennung ${pfostenKennung} ist bereits vergeben.`);
    }
  } catch (error) {
    if ((error as { status?: number })?.status === 404) {
      return;
    }

    throw error;
  }
}

function parseGeomJson(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  return typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function relationFieldValue(record: RecordModel, field: string): string | null {
  const value = record[field];

  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
    return value[0].trim();
  }

  return null;
}

function isValidLineStringCoordinates(value: unknown): value is [number, number][] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length >= 2 &&
        typeof entry[0] === 'number' &&
        Number.isFinite(entry[0]) &&
        typeof entry[1] === 'number' &&
        Number.isFinite(entry[1])
    )
  );
}

function getPointCoordinates(record: RecordModel): [number, number] | null {
  const geomJson = parseGeomJson(record.geom_json);

  if (record.geom_typ !== 'Point' || !geomJson || geomJson.type !== 'Point' || !Array.isArray(geomJson.coordinates)) {
    return null;
  }

  const [lon, lat] = geomJson.coordinates;

  if (
    typeof lon !== 'number' ||
    !Number.isFinite(lon) ||
    typeof lat !== 'number' ||
    !Number.isFinite(lat)
  ) {
    return null;
  }

  return [lon, lat];
}

function normalizeLineStringCoordinates(
  value: unknown,
  startCoordinates: [number, number],
  endCoordinates: [number, number]
): [number, number][] | null {
  if (!isValidLineStringCoordinates(value)) {
    return null;
  }

  const normalized = value.map((coordinate) => [...coordinate] as [number, number]);

  if (normalized.length < 2) {
    return null;
  }

  normalized[0] = [...startCoordinates];
  normalized[normalized.length - 1] = [...endCoordinates];

  return normalized;
}

function getLineStringCoordinates(record: RecordModel): [number, number][] | null {
  const geomJson = parseGeomJson(record.geom_json);

  if (record.geom_typ !== 'LineString' || !geomJson || geomJson.type !== 'LineString') {
    return null;
  }

  return isValidLineStringCoordinates(geomJson.coordinates) ? geomJson.coordinates : null;
}

async function syncConnectedKantenForMovedKnoten(
  pbAdmin: PocketBaseClient,
  knotenId: string,
  lon: number,
  lat: number
) {
  const relatedKanten = await pbAdmin.collection('kanten').getFullList<RecordModel>({
    sort: 'kanten_nr'
  });

  const connectedKanten = relatedKanten.filter((kante) => {
    const startKnoten = relationFieldValue(kante, 'start_knoten');
    const endKnoten = relationFieldValue(kante, 'end_knoten');
    return startKnoten === knotenId || endKnoten === knotenId;
  });

  for (const kante of connectedKanten) {
    const startKnoten = relationFieldValue(kante, 'start_knoten');
    const endKnoten = relationFieldValue(kante, 'end_knoten');
    const currentGeomJson = parseGeomJson(kante.geom_json);
    const coordinates = currentGeomJson?.coordinates;

    if (kante.geom_typ !== 'LineString' || !currentGeomJson || currentGeomJson.type !== 'LineString') {
      console.warn('Kante wird nicht aktualisiert, weil keine gueltige LineString-Geometrie vorliegt.', {
        kanteId: String(kante.id ?? ''),
        geomTyp: kante.geom_typ,
        geomJson: kante.geom_json
      });
      continue;
    }

    if (!isValidLineStringCoordinates(coordinates)) {
      console.warn('Kante wird nicht aktualisiert, weil die LineString-Koordinaten ungueltig sind.', {
        kanteId: String(kante.id ?? ''),
        geomJson: kante.geom_json
      });
      continue;
    }

    const nextCoordinates = coordinates.map((coordinate) => [...coordinate] as [number, number]);

    if (startKnoten === knotenId) {
      nextCoordinates[0] = [lon, lat];
    }

    if (endKnoten === knotenId) {
      nextCoordinates[nextCoordinates.length - 1] = [lon, lat];
    }

    await pbAdmin.collection('kanten').update(String(kante.id ?? ''), {
      geom_typ: 'LineString',
      geom_json: {
        type: 'LineString',
        coordinates: nextCoordinates
      }
    });
  }
}

async function updateKnotenGeometry(
  pbAdmin: PocketBaseClient,
  knotenId: string,
  lon: number,
  lat: number
) {
  await pbAdmin.collection('knoten').update(knotenId, {
    geom_typ: 'Point',
    geom_json: {
      type: 'Point',
      coordinates: [lon, lat]
    },
    lon,
    lat
  });

  await syncConnectedKantenForMovedKnoten(pbAdmin, knotenId, lon, lat);
}

function getAuthorizedPocketBase(event: Parameters<Actions[keyof Actions]>[0], permission: 'edit' | 'delete') {
  ensurePermission(event, permission);

  if (!event.locals.pb) {
    throw error(503, 'PocketBase ist nicht konfiguriert oder aktuell nicht erreichbar.');
  }

  return event.locals.pb;
}

function mapKnotenRecord(record: RecordModel) {
  const bezeichnung =
    typeof record.bezeichnung === 'string' && record.bezeichnung.trim()
      ? record.bezeichnung.trim()
      : '';
  const knotenNr =
    typeof record.knoten_nr === 'string' && record.knoten_nr.trim() ? record.knoten_nr.trim() : 'Knoten';

  return {
    id: String(record.id ?? ''),
    collection: 'knoten' as const,
    title: bezeichnung || knotenNr,
    subtitle: knotenNr,
    status: typeof record.status === 'string' ? record.status : '',
    geomJson:
      typeof record.geom_json === 'object' && record.geom_json ? (record.geom_json as Record<string, unknown>) : null,
    lon: typeof record.lon === 'number' ? record.lon : null,
    lat: typeof record.lat === 'number' ? record.lat : null
  };
}

export const actions: Actions = {
  createKnoten: async (event) => {
    const pbAdmin = getAuthorizedPocketBase(event, 'edit');
    const values = await event.request.formData();
    const requestedKnotenNr = formValue(values, 'knoten_nr');
    const bezeichnung = formValue(values, 'bezeichnung');
    const kreis = formValue(values, 'kreis');
    const kommune = formValue(values, 'kommune');
    const katasterkennung = formValue(values, 'katasterkennung');
    const knotenKennung = normalizeNrwKnotenKennung(formValue(values, 'knoten_kennung'));
    const pfostenKennung = formValue(values, 'pfosten_kennung');
    const pfostenNr = formValue(values, 'pfosten_nr');
    const nrwPoiNr = formValue(values, 'nrw_poi_nr');
    const nrwTyp = formValue(values, 'nrw_typ');
    const nrwKommune = formValue(values, 'nrw_kommune');
    const nrwSourceUrl = formValue(values, 'nrw_source_url');
    const nrwRawValue = formValue(values, 'nrw_raw_value');
    const nrwObjectId = formValue(values, 'nrw_object_id');
    const nrwPfostenJson = formValue(values, 'nrw_pfosten_json');
    const offizielleKnotenNr = normalizeOfficialKnotenNr(formValue(values, 'offizielle_knoten_nr'));
    const status = formValue(values, 'status');
    const knotenpunktNrRaw = formValue(values, 'knotenpunkt_nr');
    const bemerkung = formValue(values, 'bemerkung');
    const lonRaw = formValue(values, 'lon');
    const latRaw = formValue(values, 'lat');
    const aktiv = values.get('aktiv') === 'on';
    const knotenNr = knotenKennung || requestedKnotenNr;
    const submittedNrwPfosten = parseSubmittedNrwPfosten(nrwPfostenJson, knotenKennung);

    values.set('knoten_nr', knotenNr);
    values.set('knoten_kennung', knotenKennung);

    console.log('NRW-Kataster: Eingang Pfostenkandidaten im Knoten-Create.', {
      rawNrwPfostenJson: nrwPfostenJson,
      submittedCandidateCount: submittedNrwPfosten.length,
      candidates: submittedNrwPfosten.map((candidate) => candidate.pfostenKennung)
    });

    if (!knotenNr) {
      return fail(400, {
        success: false,
        action: 'createKnoten',
        message: 'Knoten-Nr. ist erforderlich.',
        values: Object.fromEntries(values)
      });
    }

    if (!status) {
      return fail(400, {
        success: false,
        action: 'createKnoten',
        message: 'Status ist erforderlich.',
        values: Object.fromEntries(values)
      });
    }

    const lon = parseNumberInput(lonRaw);
    const lat = parseNumberInput(latRaw);

    if (lon === null || lat === null) {
      return fail(400, {
        success: false,
        action: 'createKnoten',
        message: 'Die Kartenkoordinaten sind ungueltig.',
        values: Object.fromEntries(values)
      });
    }

    let knotenpunktNr: number | null = null;

    if (knotenpunktNrRaw) {
      knotenpunktNr = parseNumberInput(knotenpunktNrRaw);

      if (
        knotenpunktNr === null ||
        !Number.isInteger(knotenpunktNr) ||
        knotenpunktNr < 1 ||
        knotenpunktNr > 99
      ) {
        return fail(400, {
          success: false,
          action: 'createKnoten',
          message: 'Knotenpunkt-Nr. muss eine ganze Zahl zwischen 1 und 99 sein.',
          values: Object.fromEntries(values)
        });
      }
    }

    const geomJson = {
      type: 'Point',
      coordinates: [lon, lat]
    };

    const payload = {
      knoten_nr: knotenNr,
      bezeichnung,
      kreis,
      kommune,
      katasterkennung,
      katasterkennung_knoten: knotenKennung,
      knoten_kennung: knotenKennung,
      pfosten_kennung: pfostenKennung,
      pfosten_nr: pfostenNr,
      nrw_poi_nr: nrwPoiNr,
      nrw_typ: nrwTyp,
      nrw_kommune: nrwKommune,
      nrw_source_url: nrwSourceUrl,
      nrw_raw_value: nrwRawValue,
      nrw_object_id: nrwObjectId,
      ...(offizielleKnotenNr ? { offizielle_knoten_nr: offizielleKnotenNr } : {}),
      status,
      knotenpunkt_nr: knotenpunktNr,
      bemerkung,
      aktiv,
      geom_typ: 'Point',
      geom_json: geomJson,
      lon,
      lat
    };

    try {
      try {
        await pbAdmin.collection('knoten').getFirstListItem<RecordModel>(
          pbAdmin.filter('knoten_nr = {:knotenNr}', { knotenNr })
        );

        return fail(409, {
          success: false,
          action: 'createKnoten',
          message: `Ein Knoten mit der Knoten-Nr. ${knotenNr} existiert bereits. Es wurde kein neuer Knoten angelegt.`,
          values: Object.fromEntries(values)
        });
      } catch (lookupError) {
        if ((lookupError as { status?: number })?.status !== 404) {
          throw lookupError;
        }
      }

      console.log('TODO DEBUG NRW-KATASTER Knoten-Create-Payload.', {
        knoten_kennung: payload.knoten_kennung,
        pfosten_kennung: payload.pfosten_kennung,
        pfosten_nr: payload.pfosten_nr,
        nrw_poi_nr: payload.nrw_poi_nr,
        nrw_raw_value: payload.nrw_raw_value,
        nrw_object_id: payload.nrw_object_id,
        offizielle_knoten_nr: payload.offizielle_knoten_nr,
        knoten_nr: payload.knoten_nr
      });
      const createdRecord = await createRecordWithSchemaFallback(pbAdmin, 'knoten', payload);

      console.log('NRW-Kataster: Neu angelegter Knoten fuer automatische Pfosten.', {
        knotenId: String(createdRecord.id ?? ''),
        knotenNr,
        knotenKennung,
        submittedCandidateCount: submittedNrwPfosten.length
      });

      const automaticPfosten = submittedNrwPfosten.length
        ? await createMissingNrwPfosten(pbAdmin, createdRecord.id, submittedNrwPfosten)
        : { created: [], existing: [], missingCoordinates: [] };

      if (!submittedNrwPfosten.length) {
        console.log('NRW-Kataster: Keine Pfostenkandidaten im Formular angekommen; automatische Anlage nicht gestartet.', {
          knotenId: String(createdRecord.id ?? ''),
          rawNrwPfostenJson: nrwPfostenJson
        });
      }
      const createdMessage = automaticPfosten.created.length
        ? ` Automatisch angelegte Pfosten: ${automaticPfosten.created.join(', ')}.`
        : '';
      const skippedMessage = automaticPfosten.existing.length
        ? ` Bereits vorhandene Pfosten uebersprungen: ${automaticPfosten.existing.join(', ')}.`
        : '';
      const missingCoordinatesMessage = automaticPfosten.missingCoordinates.length
        ? ` Wegen fehlender eigener Koordinate nicht angelegte Pfosten: ${automaticPfosten.missingCoordinates.join(', ')}.`
        : '';

      return {
        success: true,
        action: 'createKnoten',
        message: `Knoten wurde gespeichert.${createdMessage}${skippedMessage}${missingCoordinatesMessage}`,
        createdKnoten: mapKnotenRecord(createdRecord)
      };
    } catch (error) {
      console.error('Knoten konnte nicht gespeichert werden.', error);

      return fail(500, {
        success: false,
        action: 'createKnoten',
        message: describePocketBaseError(error, 'Knoten konnte nicht gespeichert werden.'),
        values: Object.fromEntries(values)
      });
    }
  },

  updateKnoten: async (event) => {
    const pbAdmin = getAuthorizedPocketBase(event, 'edit');
    const values = await event.request.formData();
    const id = formValue(values, 'id');
    const knotenNr = formValue(values, 'knoten_nr');
    const bezeichnung = formValue(values, 'bezeichnung');
    const kreis = formValue(values, 'kreis');
    const kommune = formValue(values, 'kommune');
    const katasterkennung = formValue(values, 'katasterkennung');
    const knotenKennung = formValue(values, 'knoten_kennung');
    const pfostenKennung = formValue(values, 'pfosten_kennung');
    const pfostenNr = formValue(values, 'pfosten_nr');
    const nrwPoiNr = formValue(values, 'nrw_poi_nr');
    const nrwTyp = formValue(values, 'nrw_typ');
    const nrwKommune = formValue(values, 'nrw_kommune');
    const nrwSourceUrl = formValue(values, 'nrw_source_url');
    const nrwRawValue = formValue(values, 'nrw_raw_value');
    const nrwObjectId = formValue(values, 'nrw_object_id');
    const offizielleKnotenNr = normalizeOfficialKnotenNr(formValue(values, 'offizielle_knoten_nr'));
    const status = formValue(values, 'status');
    const knotenpunktNrRaw = formValue(values, 'knotenpunkt_nr');
    const bemerkung = formValue(values, 'bemerkung');
    const lonRaw = formValue(values, 'lon');
    const latRaw = formValue(values, 'lat');
    const aktiv = values.get('aktiv') === 'on';

    if (!id) {
      return fail(400, {
        success: false,
        action: 'updateKnoten',
        message: 'Die Knoten-ID fehlt.',
        values: Object.fromEntries(values)
      });
    }

    if (!knotenNr) {
      return fail(400, {
        success: false,
        action: 'updateKnoten',
        message: 'Knoten-Nr. ist erforderlich.',
        values: Object.fromEntries(values)
      });
    }

    if (!status) {
      return fail(400, {
        success: false,
        action: 'updateKnoten',
        message: 'Status ist erforderlich.',
        values: Object.fromEntries(values)
      });
    }

    const lon = parseNumberInput(lonRaw);
    const lat = parseNumberInput(latRaw);

    if (lon === null || lat === null) {
      return fail(400, {
        success: false,
        action: 'updateKnoten',
        message: 'Die Kartenkoordinaten sind ungueltig.',
        values: Object.fromEntries(values)
      });
    }

    let knotenpunktNr: number | null = null;

    if (knotenpunktNrRaw) {
      knotenpunktNr = parseNumberInput(knotenpunktNrRaw);

      if (
        knotenpunktNr === null ||
        !Number.isInteger(knotenpunktNr) ||
        knotenpunktNr < 1 ||
        knotenpunktNr > 99
      ) {
        return fail(400, {
          success: false,
          action: 'updateKnoten',
          message: 'Knotenpunkt-Nr. muss eine ganze Zahl zwischen 1 und 99 sein.',
          values: Object.fromEntries(values)
        });
      }
    }

    const geomJson = {
      type: 'Point',
      coordinates: [lon, lat]
    };

    const payload = {
      knoten_nr: knotenNr,
      bezeichnung,
      kreis,
      kommune,
      katasterkennung,
      katasterkennung_knoten: knotenKennung,
      knoten_kennung: knotenKennung,
      pfosten_kennung: pfostenKennung,
      pfosten_nr: pfostenNr,
      nrw_poi_nr: nrwPoiNr,
      nrw_typ: nrwTyp,
      nrw_kommune: nrwKommune,
      nrw_source_url: nrwSourceUrl,
      nrw_raw_value: nrwRawValue,
      nrw_object_id: nrwObjectId,
      ...(offizielleKnotenNr ? { offizielle_knoten_nr: offizielleKnotenNr } : {}),
      status,
      knotenpunkt_nr: knotenpunktNr,
      bemerkung,
      aktiv,
      geom_typ: 'Point',
      geom_json: geomJson,
      lon,
      lat
    };

    try {
      console.log('TODO DEBUG NRW-KATASTER Knoten-Update-Payload.', {
        knoten_kennung: payload.knoten_kennung,
        pfosten_kennung: payload.pfosten_kennung,
        pfosten_nr: payload.pfosten_nr,
        nrw_poi_nr: payload.nrw_poi_nr,
        nrw_raw_value: payload.nrw_raw_value,
        nrw_object_id: payload.nrw_object_id,
        offizielle_knoten_nr: payload.offizielle_knoten_nr,
        knoten_nr: payload.knoten_nr
      });
      await updateRecordWithSchemaFallback(pbAdmin, 'knoten', id, payload);
      await syncConnectedKantenForMovedKnoten(pbAdmin, id, lon, lat);

      return {
        success: true,
        action: 'updateKnoten',
        message: 'Knoten wurde aktualisiert.'
      };
    } catch (error) {
      console.error('Knoten konnte nicht aktualisiert werden.', error);

      return fail(500, {
        success: false,
        action: 'updateKnoten',
        message: describePocketBaseError(error, 'Knoten konnte nicht aktualisiert werden.'),
        values: Object.fromEntries(values)
      });
    }
  },

  createPfosten: async (event) => {
    const pbAdmin = getAuthorizedPocketBase(event, 'edit');
    const values = await event.request.formData();
    const knotenId = formValue(values, 'knoten');
    const requestedPfostenKennung = formValue(values, 'pfosten_kennung');
    const typ = formValue(values, 'typ');
    const material = formValue(values, 'material');
    const bestandStatus = formValue(values, 'bestand_status') || 'vorhanden';
    const bemerkung = formValue(values, 'bemerkung');
    const lonRaw = formValue(values, 'lon');
    const latRaw = formValue(values, 'lat');
    const aktiv = values.get('aktiv') === 'on';

    if (!knotenId) {
      return fail(400, {
        success: false,
        action: 'createPfosten',
        message: 'Der zugehoerige Knoten fehlt.',
        values: Object.fromEntries(values)
      });
    }

    if (!typ || !material || !bestandStatus) {
      return fail(400, {
        success: false,
        action: 'createPfosten',
        message: 'Typ, Material und Bestand-Status sind erforderlich.',
        values: Object.fromEntries(values)
      });
    }

    const lon = parseNumberInput(lonRaw);
    const lat = parseNumberInput(latRaw);

    if (lon === null || lat === null) {
      return fail(400, {
        success: false,
        action: 'createPfosten',
        message: 'Die Pfostenkoordinaten sind ungueltig.',
        values: Object.fromEntries(values)
      });
    }

    const geomJson = {
      type: 'Point',
      coordinates: [lon, lat]
    };

    try {
      const knotenRecord = await pbAdmin.collection('knoten').getOne<RecordModel>(knotenId);
      const pfostenIndex = await getNextPfostenIndex(pbAdmin, knotenId);
      const knotenKennung = getKnotenKennung(knotenRecord);
      const pfostenKennung = requestedPfostenKennung || createPfostenKennung(knotenKennung, pfostenIndex);
      const pfostenNr = pfostenKennung;
      const payload = {
        knoten: knotenId,
        pfosten_index: pfostenIndex,
        pfosten_kennung: pfostenKennung,
        pfosten_nr: pfostenNr,
        typ,
        pfosten_typ: typ,
        material,
        bemerkung,
        aktiv,
        bestand_status: bestandStatus,
        geom_typ: 'Point',
        geom_json: geomJson,
        lon,
        lat
      };

      await ensurePfostenKennungIsAvailable(pbAdmin, pfostenKennung);
      await createRecordWithSchemaFallback(pbAdmin, 'pfosten', payload);
      return {
        success: true,
        action: 'createPfosten',
        message: 'Pfosten wurde gespeichert.'
      };
    } catch (error) {
      console.error('Pfosten konnte nicht gespeichert werden.', error);

      return fail(500, {
        success: false,
        action: 'createPfosten',
        message: describePocketBaseError(error, 'Pfosten konnte nicht gespeichert werden.'),
        values: Object.fromEntries(values)
      });
    }
  },

  updatePfosten: async (event) => {
    const pbAdmin = getAuthorizedPocketBase(event, 'edit');
    const values = await event.request.formData();
    const id = formValue(values, 'id');
    const knotenId = formValue(values, 'knoten');
    const pfostenIndex = parsePositiveIntegerInput(formValue(values, 'pfosten_index'));
    const requestedPfostenKennung = formValue(values, 'pfosten_kennung');
    const typ = formValue(values, 'typ');
    const material = formValue(values, 'material');
    const bestandStatus = formValue(values, 'bestand_status') || 'vorhanden';
    const bemerkung = formValue(values, 'bemerkung');
    const lonRaw = formValue(values, 'lon');
    const latRaw = formValue(values, 'lat');
    const aktiv = values.get('aktiv') === 'on';

    if (!id || !knotenId || pfostenIndex === null) {
      return fail(400, {
        success: false,
        action: 'updatePfosten',
        message: 'Pfosten-ID, Knotenrelation und laufende Pfostennummer sind erforderlich.',
        values: Object.fromEntries(values)
      });
    }

    if (!typ || !material || !bestandStatus) {
      return fail(400, {
        success: false,
        action: 'updatePfosten',
        message: 'Typ, Material und Bestand-Status sind erforderlich.',
        values: Object.fromEntries(values)
      });
    }

    const lon = parseNumberInput(lonRaw);
    const lat = parseNumberInput(latRaw);

    if (lon === null || lat === null) {
      return fail(400, {
        success: false,
        action: 'updatePfosten',
        message: 'Die Pfostenkoordinaten sind ungueltig.',
        values: Object.fromEntries(values)
      });
    }

    try {
      const knotenRecord = await pbAdmin.collection('knoten').getOne<RecordModel>(knotenId);
      const knotenKennung = getKnotenKennung(knotenRecord);
      const pfostenKennung = requestedPfostenKennung || createPfostenKennung(knotenKennung, pfostenIndex);
      const pfostenNr = pfostenKennung;
      const payload = {
        knoten: knotenId,
        pfosten_index: pfostenIndex,
        pfosten_kennung: pfostenKennung,
        pfosten_nr: pfostenNr,
        typ,
        pfosten_typ: typ,
        material,
        bemerkung,
        aktiv,
        bestand_status: bestandStatus,
        geom_typ: 'Point',
        geom_json: {
          type: 'Point',
          coordinates: [lon, lat]
        },
        lon,
        lat
      };

      await ensurePfostenKennungIsAvailable(pbAdmin, pfostenKennung, id);
      await updateRecordWithSchemaFallback(pbAdmin, 'pfosten', id, payload);

      return {
        success: true,
        action: 'updatePfosten',
        message: 'Pfosten wurde aktualisiert.'
      };
    } catch (error) {
      console.error('Pfosten konnte nicht aktualisiert werden.', error);

      return fail(500, {
        success: false,
        action: 'updatePfosten',
        message: describePocketBaseError(error, 'Pfosten konnte nicht aktualisiert werden.'),
        values: Object.fromEntries(values)
      });
    }
  },

  deletePfosten: async (event) => {
    const pbAdmin = getAuthorizedPocketBase(event, 'delete');
    const values = await event.request.formData();
    const id = formValue(values, 'id');

    if (!id) {
      return fail(400, {
        success: false,
        action: 'deletePfosten',
        message: 'Die Pfosten-ID fehlt.',
        values: Object.fromEntries(values)
      });
    }

    try {
      await updateRecordWithSchemaFallback(pbAdmin, 'pfosten', id, {
        bestand_status: 'zu_entfernen',
        aktiv: false
      });

      return {
        success: true,
        action: 'deletePfosten',
        message: 'Pfosten wurde geloescht.'
      };
    } catch (error) {
      console.error('Pfosten konnte nicht geloescht werden.', error);

      return fail(500, {
        success: false,
        action: 'deletePfosten',
        message: describePocketBaseError(error, 'Pfosten konnte nicht geloescht werden.'),
        values: Object.fromEntries(values)
      });
    }
  },

  createKante: async (event) => {
    const pbAdmin = getAuthorizedPocketBase(event, 'edit');
    const values = await event.request.formData();
    const startKnotenId = formValue(values, 'start_knoten');
    const endKnotenId = formValue(values, 'end_knoten');
    const kantenNr = formValue(values, 'kanten_nr');
    const status = formValue(values, 'status');
    const art = formValue(values, 'art');
    const linienstil = formValue(values, 'linienstil');
    const bemerkung = formValue(values, 'bemerkung');
    const aktiv = values.get('aktiv') === 'on';
    const coordinatesRaw = formValue(values, 'coordinates_json');

    if (!startKnotenId || !endKnotenId) {
      return fail(400, {
        success: false,
        action: 'createKante',
        message: 'Start- und Zielknoten sind erforderlich.',
        values: Object.fromEntries(values)
      });
    }

    if (startKnotenId === endKnotenId) {
      return fail(400, {
        success: false,
        action: 'createKante',
        message: 'Start- und Zielknoten muessen unterschiedlich sein.',
        values: Object.fromEntries(values)
      });
    }

    if (!kantenNr || !status || !art || !linienstil) {
      return fail(400, {
        success: false,
        action: 'createKante',
        message: 'Kanten-Nr., Status, Art und Linienstil sind erforderlich.',
        values: Object.fromEntries(values)
      });
    }

    try {
      const [startKnoten, endKnoten] = await Promise.all([
        pbAdmin.collection('knoten').getOne<RecordModel>(startKnotenId),
        pbAdmin.collection('knoten').getOne<RecordModel>(endKnotenId)
      ]);

      const startCoordinates = getPointCoordinates(startKnoten);
      const endCoordinates = getPointCoordinates(endKnoten);

      if (!startCoordinates || !endCoordinates) {
        return fail(400, {
          success: false,
          action: 'createKante',
          message: 'Start- oder Zielknoten hat keine gueltige Point-Geometrie.',
          values: Object.fromEntries(values)
        });
      }

      const clientCoordinates = coordinatesRaw ? JSON.parse(coordinatesRaw) : [startCoordinates, endCoordinates];
      const normalizedCoordinates = normalizeLineStringCoordinates(
        clientCoordinates,
        startCoordinates,
        endCoordinates
      );

      if (!normalizedCoordinates) {
        return fail(400, {
          success: false,
          action: 'createKante',
          message: 'Die Kantengeometrie ist ungueltig.',
          values: Object.fromEntries(values)
        });
      }

      await pbAdmin.collection('kanten').create({
        start_knoten: startKnotenId,
        end_knoten: endKnotenId,
        kanten_nr: kantenNr,
        status,
        art,
        geom_typ: 'LineString',
        geom_json: {
          type: 'LineString',
          coordinates: normalizedCoordinates
        },
        linienstil,
        bemerkung,
        aktiv
      });

      return {
        success: true,
        action: 'createKante',
        message: 'Kante wurde gespeichert.'
      };
    } catch (error) {
      console.error('Kante konnte nicht gespeichert werden.', error);

      return fail(500, {
        success: false,
        action: 'createKante',
        message: 'Kante konnte nicht gespeichert werden.',
        values: Object.fromEntries(values)
      });
    }
  },

  updateKante: async (event) => {
    const pbAdmin = getAuthorizedPocketBase(event, 'edit');
    const values = await event.request.formData();
    const id = formValue(values, 'id');
    const startKnotenId = formValue(values, 'start_knoten');
    const endKnotenId = formValue(values, 'end_knoten');
    const kantenNr = formValue(values, 'kanten_nr');
    const status = formValue(values, 'status');
    const art = formValue(values, 'art');
    const linienstil = formValue(values, 'linienstil');
    const bemerkung = formValue(values, 'bemerkung');
    const aktiv = values.get('aktiv') === 'on';
    const coordinatesRaw = formValue(values, 'coordinates_json');

    if (!id || !startKnotenId || !endKnotenId) {
      return fail(400, {
        success: false,
        action: 'updateKante',
        message: 'Kanten-ID, Start- und Zielknoten sind erforderlich.',
        values: Object.fromEntries(values)
      });
    }

    if (startKnotenId === endKnotenId) {
      return fail(400, {
        success: false,
        action: 'updateKante',
        message: 'Start- und Zielknoten muessen unterschiedlich sein.',
        values: Object.fromEntries(values)
      });
    }

    if (!kantenNr || !status || !art || !linienstil || !coordinatesRaw) {
      return fail(400, {
        success: false,
        action: 'updateKante',
        message: 'Kanten-Nr., Status, Art, Linienstil und Geometrie sind erforderlich.',
        values: Object.fromEntries(values)
      });
    }

    try {
      const [startKnoten, endKnoten] = await Promise.all([
        pbAdmin.collection('knoten').getOne<RecordModel>(startKnotenId),
        pbAdmin.collection('knoten').getOne<RecordModel>(endKnotenId)
      ]);

      const startCoordinates = getPointCoordinates(startKnoten);
      const endCoordinates = getPointCoordinates(endKnoten);

      if (!startCoordinates || !endCoordinates) {
        return fail(400, {
          success: false,
          action: 'updateKante',
          message: 'Start- oder Zielknoten hat keine gueltige Point-Geometrie.',
          values: Object.fromEntries(values)
        });
      }

      const parsedCoordinates = JSON.parse(coordinatesRaw);

      if (!isValidLineStringCoordinates(parsedCoordinates)) {
        return fail(400, {
          success: false,
          action: 'updateKante',
          message: 'Die Kantengeometrie ist ungueltig.',
          values: Object.fromEntries(values)
        });
      }

      const requestedStart = parsedCoordinates[0];
      const requestedEnd = parsedCoordinates[parsedCoordinates.length - 1];

      if (!requestedStart || !requestedEnd) {
        return fail(400, {
          success: false,
          action: 'updateKante',
          message: 'Die Kantengeometrie ist ungueltig.',
          values: Object.fromEntries(values)
        });
      }

      if (
        requestedStart[0] !== startCoordinates[0] ||
        requestedStart[1] !== startCoordinates[1]
      ) {
        await updateKnotenGeometry(pbAdmin, startKnotenId, requestedStart[0], requestedStart[1]);
      }

      if (
        requestedEnd[0] !== endCoordinates[0] ||
        requestedEnd[1] !== endCoordinates[1]
      ) {
        await updateKnotenGeometry(pbAdmin, endKnotenId, requestedEnd[0], requestedEnd[1]);
      }

      const finalStartKnoten = await pbAdmin.collection('knoten').getOne<RecordModel>(startKnotenId);
      const finalEndKnoten = await pbAdmin.collection('knoten').getOne<RecordModel>(endKnotenId);
      const finalStartCoordinates = getPointCoordinates(finalStartKnoten);
      const finalEndCoordinates = getPointCoordinates(finalEndKnoten);

      if (!finalStartCoordinates || !finalEndCoordinates) {
        return fail(400, {
          success: false,
          action: 'updateKante',
          message: 'Start- oder Zielknoten hat nach der Aktualisierung keine gueltige Point-Geometrie.',
          values: Object.fromEntries(values)
        });
      }

      const finalCoordinates = normalizeLineStringCoordinates(
        parsedCoordinates,
        finalStartCoordinates,
        finalEndCoordinates
      );

      if (!finalCoordinates) {
        return fail(400, {
          success: false,
          action: 'updateKante',
          message: 'Die Kantengeometrie ist ungueltig.',
          values: Object.fromEntries(values)
        });
      }

      await pbAdmin.collection('kanten').update(id, {
        start_knoten: startKnotenId,
        end_knoten: endKnotenId,
        kanten_nr: kantenNr,
        status,
        art,
        geom_typ: 'LineString',
        geom_json: {
          type: 'LineString',
          coordinates: finalCoordinates
        },
        linienstil,
        bemerkung,
        aktiv
      });

      return {
        success: true,
        action: 'updateKante',
        message: 'Kante wurde aktualisiert.'
      };
    } catch (error) {
      console.error('Kante konnte nicht aktualisiert werden.', error);

      return fail(500, {
        success: false,
        action: 'updateKante',
        message: 'Kante konnte nicht aktualisiert werden.',
        values: Object.fromEntries(values)
      });
    }
  },

  deleteKnoten: async (event) => {
    const pbAdmin = getAuthorizedPocketBase(event, 'delete');
    const values = await event.request.formData();
    const id = formValue(values, 'id');

    if (!id) {
      return fail(400, {
        success: false,
        action: 'deleteKnoten',
        message: 'Die Knoten-ID fehlt.',
        values: Object.fromEntries(values)
      });
    }

    try {
      const relatedKanten = await pbAdmin.collection('kanten').getFullList<RecordModel>({
        sort: 'kanten_nr'
      });

      const connectedKanten = relatedKanten.filter((kante) => {
        const startKnoten = relationFieldValue(kante, 'start_knoten');
        const endKnoten = relationFieldValue(kante, 'end_knoten');
        return startKnoten === id || endKnoten === id;
      });

      if (connectedKanten.length > 0) {
        return fail(400, {
          success: false,
          action: 'deleteKnoten',
          message: 'Knoten kann nicht geloescht werden, solange noch verbundene Kanten existieren.',
          values: Object.fromEntries(values)
        });
      }

      await pbAdmin.collection('knoten').delete(id);

      return {
        success: true,
        action: 'deleteKnoten',
        message: 'Knoten wurde geloescht.'
      };
    } catch (error) {
      console.error('Knoten konnte nicht geloescht werden.', error);

      return fail(500, {
        success: false,
        action: 'deleteKnoten',
        message: 'Knoten konnte nicht geloescht werden.',
        values: Object.fromEntries(values)
      });
    }
  },

  deleteKante: async (event) => {
    const pbAdmin = getAuthorizedPocketBase(event, 'delete');
    const values = await event.request.formData();
    const id = formValue(values, 'id');

    if (!id) {
      return fail(400, {
        success: false,
        action: 'deleteKante',
        message: 'Die Kanten-ID fehlt.',
        values: Object.fromEntries(values)
      });
    }

    try {
      await pbAdmin.collection('kanten').delete(id);

      return {
        success: true,
        action: 'deleteKante',
        message: 'Kante wurde geloescht.'
      };
    } catch (error) {
      console.error('Kante konnte nicht geloescht werden.', error);

      return fail(500, {
        success: false,
        action: 'deleteKante',
        message: 'Kante konnte nicht geloescht werden.',
        values: Object.fromEntries(values)
      });
    }
  }
};

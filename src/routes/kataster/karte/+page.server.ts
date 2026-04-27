import { createPocketBaseAdminClient } from '$lib/server/pocketbase-admin';
import { loadKatasterMapData } from '$lib/server/kataster';
import { fail } from '@sveltejs/kit';
import type { RecordModel } from 'pocketbase';
import type { Actions, PageServerLoad } from './$types';

type PocketBaseAdminClient = NonNullable<Awaited<ReturnType<typeof createPocketBaseAdminClient>>>;

export const load: PageServerLoad = async () => {
  return await loadKatasterMapData();
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
  pbAdmin: PocketBaseAdminClient,
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
  pbAdmin: PocketBaseAdminClient,
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
  createKnoten: async ({ request }) => {
    const pbAdmin = await createPocketBaseAdminClient().catch((error) => {
      console.error('PocketBase-Admin-Authentifizierung fuer Knoten fehlgeschlagen.', error);
      return null;
    });

    if (!pbAdmin) {
      return fail(503, {
        success: false,
        action: 'createKnoten',
        message: 'PocketBase-Admin-Zugang ist nicht konfiguriert oder nicht erreichbar.'
      });
    }

    const values = await request.formData();
    const knotenNr = formValue(values, 'knoten_nr');
    const bezeichnung = formValue(values, 'bezeichnung');
    const status = formValue(values, 'status');
    const knotenpunktNrRaw = formValue(values, 'knotenpunkt_nr');
    const bemerkung = formValue(values, 'bemerkung');
    const lonRaw = formValue(values, 'lon');
    const latRaw = formValue(values, 'lat');
    const aktiv = values.get('aktiv') === 'on';

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

    try {
      const createdRecord = await pbAdmin.collection('knoten').create({
        knoten_nr: knotenNr,
        bezeichnung,
        status,
        knotenpunkt_nr: knotenpunktNr,
        bemerkung,
        aktiv,
        geom_typ: 'Point',
        geom_json: geomJson,
        lon,
        lat
      });

      return {
        success: true,
        action: 'createKnoten',
        message: 'Knoten wurde gespeichert.',
        createdKnoten: mapKnotenRecord(createdRecord)
      };
    } catch (error) {
      console.error('Knoten konnte nicht gespeichert werden.', error);

      return fail(500, {
        success: false,
        action: 'createKnoten',
        message: 'Knoten konnte nicht gespeichert werden.',
        values: Object.fromEntries(values)
      });
    }
  },

  updateKnoten: async ({ request }) => {
    const pbAdmin = await createPocketBaseAdminClient().catch((error) => {
      console.error('PocketBase-Admin-Authentifizierung fuer Knoten fehlgeschlagen.', error);
      return null;
    });

    if (!pbAdmin) {
      return fail(503, {
        success: false,
        action: 'updateKnoten',
        message: 'PocketBase-Admin-Zugang ist nicht konfiguriert oder nicht erreichbar.'
      });
    }

    const values = await request.formData();
    const id = formValue(values, 'id');
    const knotenNr = formValue(values, 'knoten_nr');
    const bezeichnung = formValue(values, 'bezeichnung');
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

    try {
      await pbAdmin.collection('knoten').update(id, {
        knoten_nr: knotenNr,
        bezeichnung,
        status,
        knotenpunkt_nr: knotenpunktNr,
        bemerkung,
        aktiv,
        geom_typ: 'Point',
        geom_json: geomJson,
        lon,
        lat
      });

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
        message: 'Knoten konnte nicht aktualisiert werden.',
        values: Object.fromEntries(values)
      });
    }
  },

  createKante: async ({ request }) => {
    const pbAdmin = await createPocketBaseAdminClient().catch((error) => {
      console.error('PocketBase-Admin-Authentifizierung fuer Kanten fehlgeschlagen.', error);
      return null;
    });

    if (!pbAdmin) {
      return fail(503, {
        success: false,
        action: 'createKante',
        message: 'PocketBase-Admin-Zugang ist nicht konfiguriert oder nicht erreichbar.'
      });
    }

    const values = await request.formData();
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

  updateKante: async ({ request }) => {
    const pbAdmin = await createPocketBaseAdminClient().catch((error) => {
      console.error('PocketBase-Admin-Authentifizierung fuer Kanten fehlgeschlagen.', error);
      return null;
    });

    if (!pbAdmin) {
      return fail(503, {
        success: false,
        action: 'updateKante',
        message: 'PocketBase-Admin-Zugang ist nicht konfiguriert oder nicht erreichbar.'
      });
    }

    const values = await request.formData();
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
  }
};

export const OSM_ROAD_SEARCH_RADIUS_METERS = 100;
export const OSM_INTERSECTION_RADIUS_METERS = 30;
export const OSM_ADDRESS_SEARCH_RADIUS_METERS = 100;
export const OSM_OVERPASS_TIMEOUT_MS = 25000;
const OSM_ADDRESS_WITHOUT_STREET_MAX_DISTANCE_METERS = 20;

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

type OverpassTags = Record<string, string | undefined>;

type OverpassGeometryPoint = {
  lat: number;
  lon: number;
};

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: OverpassGeometryPoint;
  geometry?: OverpassGeometryPoint[];
  tags?: OverpassTags;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

type OverpassAreaElement = {
  type: 'area';
  id: number;
  tags?: OverpassTags;
};

type OverpassAreaResponse = {
  elements?: OverpassAreaElement[];
};

type GenerateOsmBezeichnungOptions = {
  originalCoordinate?: readonly [number, number] | null;
};

export type AdministrativeFields = {
  kreis: string | null;
  kommune: string | null;
};

type RoadCandidate = {
  name: string;
  distanceMeters: number;
};

type AddressCandidate = {
  street: string | null;
  housenumber: string;
  distanceMeters: number;
};

function buildOverpassQuery(lon: number, lat: number): string {
  return `
[out:json][timeout:25];
(
  way["highway"]["name"](around:${OSM_ROAD_SEARCH_RADIUS_METERS},${lat},${lon});
  node["addr:housenumber"](around:${OSM_ADDRESS_SEARCH_RADIUS_METERS},${lat},${lon});
  way["addr:housenumber"](around:${OSM_ADDRESS_SEARCH_RADIUS_METERS},${lat},${lon});
  relation["addr:housenumber"](around:${OSM_ADDRESS_SEARCH_RADIUS_METERS},${lat},${lon});
);
out tags center geom;
`.trim();
}

function buildAdministrativeOverpassQuery(lon: number, lat: number): string {
  return `
[out:json][timeout:25];
is_in(${lat},${lon})->.a;
area.a["boundary"="administrative"]["admin_level"];
out tags;
`.trim();
}

function isFiniteCoordinate(lon: number, lat: number): boolean {
  return Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
}

function getTagValue(tags: OverpassTags | undefined, keys: string[]): string | null {
  for (const key of keys) {
    const value = tags?.[key]?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
}

function normalizeStreetNameForMatch(value: string): string {
  return normalizeName(value)
    .replace(/\bstrasse\b/g, 'straße')
    .replace(/\bstr\.\b/g, 'straße')
    .replace(/\bstr\b/g, 'straße')
    .replace(/\s+/g, ' ')
    .trim();
}

function areStreetNamesSimilar(left: string, right: string): boolean {
  const normalizedLeft = normalizeStreetNameForMatch(left);
  const normalizedRight = normalizeStreetNameForMatch(right);

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

function hasNonEmptyTag(tags: OverpassTags | undefined, key: string): boolean {
  return typeof tags?.[key] === 'string' && Boolean(tags[key]?.trim());
}

function isPoiElement(element: OverpassElement): boolean {
  const tags = element.tags;

  if (!tags) {
    return false;
  }

  return [
    'amenity',
    'shop',
    'tourism',
    'office',
    'leisure',
    'club',
    'sport',
    'craft',
    'healthcare',
    'historic',
    'man_made',
    'building'
  ].some((key) => hasNonEmptyTag(tags, key));
}

function isStreetWay(element: OverpassElement): boolean {
  return (
    element.type === 'way' &&
    hasNonEmptyTag(element.tags, 'highway') &&
    hasNonEmptyTag(element.tags, 'name') &&
    !isPoiElement(element)
  );
}

function isAddressElement(element: OverpassElement): boolean {
  return hasNonEmptyTag(element.tags, 'addr:housenumber');
}

function distanceMeters(lonA: number, latA: number, lonB: number, latB: number): number {
  const earthRadiusMeters = 6371000;
  const latARadians = (latA * Math.PI) / 180;
  const latBRadians = (latB * Math.PI) / 180;
  const deltaLat = ((latB - latA) * Math.PI) / 180;
  const deltaLon = ((lonB - lonA) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(latARadians) * Math.cos(latBRadians) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function projectToLocalMeters(lon: number, lat: number, originLon: number, originLat: number) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = Math.cos((originLat * Math.PI) / 180) * metersPerDegreeLat;

  return {
    x: (lon - originLon) * metersPerDegreeLon,
    y: (lat - originLat) * metersPerDegreeLat
  };
}

function pointToSegmentDistanceMeters(
  lon: number,
  lat: number,
  segmentStart: OverpassGeometryPoint,
  segmentEnd: OverpassGeometryPoint
): number {
  const point = projectToLocalMeters(lon, lat, lon, lat);
  const start = projectToLocalMeters(segmentStart.lon, segmentStart.lat, lon, lat);
  const end = projectToLocalMeters(segmentEnd.lon, segmentEnd.lat, lon, lat);
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * deltaX), point.y - (start.y + t * deltaY));
}

function distanceToWayMeters(lon: number, lat: number, geometry: OverpassGeometryPoint[]): number {
  if (geometry.length === 1) {
    return distanceMeters(lon, lat, geometry[0].lon, geometry[0].lat);
  }

  let minDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < geometry.length; index += 1) {
    minDistance = Math.min(minDistance, pointToSegmentDistanceMeters(lon, lat, geometry[index - 1], geometry[index]));
  }

  return minDistance;
}

function getElementPoint(element: OverpassElement): OverpassGeometryPoint | null {
  if (typeof element.lon === 'number' && typeof element.lat === 'number') {
    return { lon: element.lon, lat: element.lat };
  }

  if (element.center && typeof element.center.lon === 'number' && typeof element.center.lat === 'number') {
    return element.center;
  }

  return null;
}

function getElementDistanceMeters(element: OverpassElement, lon: number, lat: number): number | null {
  if (Array.isArray(element.geometry) && element.geometry.length > 0) {
    return distanceToWayMeters(lon, lat, element.geometry);
  }

  const point = getElementPoint(element);

  if (!point) {
    return null;
  }

  return distanceMeters(lon, lat, point.lon, point.lat);
}

function getRoadCandidates(elements: OverpassElement[], lon: number, lat: number): RoadCandidate[] {
  const candidatesByName = new Map<string, RoadCandidate>();

  for (const element of elements) {
    if (!isStreetWay(element) || !Array.isArray(element.geometry) || element.geometry.length === 0) {
      continue;
    }

    const name = element.tags?.name?.trim();

    if (!name) {
      continue;
    }

    const distance = distanceToWayMeters(lon, lat, element.geometry);
    const key = normalizeName(name);
    const existing = candidatesByName.get(key);

    if (!existing || distance < existing.distanceMeters) {
      candidatesByName.set(key, { name, distanceMeters: distance });
    }
  }

  return Array.from(candidatesByName.values()).sort((left, right) => left.distanceMeters - right.distanceMeters);
}

function getAddressCandidates(elements: OverpassElement[], lon: number, lat: number): AddressCandidate[] {
  return elements
    .flatMap((element) => {
      if (!isAddressElement(element)) {
        return [];
      }

      const street = element.tags?.['addr:street']?.trim() || null;
      const housenumber = element.tags?.['addr:housenumber']?.trim();
      const distance = getElementDistanceMeters(element, lon, lat);

      if (!housenumber || distance === null) {
        return [];
      }

      return [
        {
          street,
          housenumber,
          distanceMeters: distance
        }
      ];
    })
    .sort((left, right) => left.distanceMeters - right.distanceMeters);
}

function findMatchingAddress(nearestRoad: RoadCandidate, addresses: AddressCandidate[]): AddressCandidate | undefined {
  return addresses.find((address) => {
    if (address.street) {
      return areStreetNamesSimilar(address.street, nearestRoad.name);
    }

    return address.distanceMeters <= OSM_ADDRESS_WITHOUT_STREET_MAX_DISTANCE_METERS;
  });
}

function buildBezeichnung(roads: RoadCandidate[], addresses: AddressCandidate[]): string {
  const intersectionRoads = roads.filter((road) => road.distanceMeters <= OSM_INTERSECTION_RADIUS_METERS);

  if (intersectionRoads.length >= 2) {
    return `${intersectionRoads[0].name} / ${intersectionRoads[1].name}`;
  }

  const nearestRoad = roads[0];

  if (!nearestRoad) {
    return '';
  }

  const matchingAddress = findMatchingAddress(nearestRoad, addresses);

  if (matchingAddress) {
    return `${nearestRoad.name} ${matchingAddress.housenumber}`;
  }

  return nearestRoad.name;
}

function getAdminLevel(element: OverpassAreaElement): number | null {
  const rawLevel = element.tags?.admin_level?.trim();

  if (!rawLevel) {
    return null;
  }

  const level = Number(rawLevel);
  return Number.isInteger(level) ? level : null;
}

function getAdminName(element: OverpassAreaElement): string | null {
  return getTagValue(element.tags, ['name:de', 'name']);
}

function hasAdminType(element: OverpassAreaElement, values: string[]): boolean {
  const adminType = element.tags?.admin_type?.trim().toLocaleLowerCase('de-DE');
  const place = element.tags?.place?.trim().toLocaleLowerCase('de-DE');
  const name = element.tags?.name?.trim().toLocaleLowerCase('de-DE');

  return values.some((value) => {
    const normalizedValue = value.toLocaleLowerCase('de-DE');
    return adminType === normalizedValue || place === normalizedValue || name?.includes(normalizedValue);
  });
}

function selectAdministrativeFields(elements: OverpassAreaElement[]): AdministrativeFields {
  const administrativeAreas = elements
    .map((element) => ({ element, level: getAdminLevel(element), name: getAdminName(element) }))
    .filter(
      (candidate): candidate is { element: OverpassAreaElement; level: number; name: string } =>
        candidate.level !== null && Boolean(candidate.name)
    )
    .sort((left, right) => left.level - right.level);

  const level6 = administrativeAreas.find((candidate) => candidate.level === 6);
  const level8 = administrativeAreas.find((candidate) => candidate.level === 8);
  const level9 = administrativeAreas.find((candidate) => candidate.level === 9);
  const level10 = administrativeAreas.find((candidate) => candidate.level === 10);
  const level11 = administrativeAreas.find((candidate) => candidate.level === 11);
  const countyLike = administrativeAreas.find(
    (candidate) =>
      candidate.level === 6 &&
      hasAdminType(candidate.element, ['kreis', 'landkreis', 'kreisfreie stadt', 'stadtkreis'])
  );
  const municipalityLike = administrativeAreas.find(
    (candidate) => candidate.level === 8 && hasAdminType(candidate.element, ['stadt', 'gemeinde'])
  );

  const kreis = countyLike?.name ?? level6?.name ?? null;
  const kommune =
    level9?.name ??
    level10?.name ??
    level11?.name ??
    (kreis && level8?.name === kreis ? null : municipalityLike?.name ?? level8?.name ?? null);

  return { kreis, kommune };
}

export async function generateKnotenBezeichnungFromOsm(
  lon: number,
  lat: number,
  options: GenerateOsmBezeichnungOptions = {}
): Promise<string> {
  if (!isFiniteCoordinate(lon, lat)) {
    // TODO DEBUG OSM-BEZEICHNUNG
    console.warn('OSM-Bezeichnung: Ungueltige WGS84-Koordinate.', { lon, lat, originalCoordinate: options.originalCoordinate });
    return '';
  }

  const query = buildOverpassQuery(lon, lat);

  // TODO DEBUG OSM-BEZEICHNUNG
  console.log('OSM-Bezeichnung: Anfrage wird vorbereitet.', {
    originalOpenLayersCoordinate: options.originalCoordinate,
    lonLat: { lon, lat },
    searchRadiusMeters: {
      road: OSM_ROAD_SEARCH_RADIUS_METERS,
      intersection: OSM_INTERSECTION_RADIUS_METERS,
      address: OSM_ADDRESS_SEARCH_RADIUS_METERS
    },
    query
  });

  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, OSM_OVERPASS_TIMEOUT_MS);

  try {
    const response = await fetch(OVERPASS_API_URL, {
      method: 'POST',
      body: query,
      signal: controller.signal,
      headers: {
        'content-type': 'text/plain;charset=UTF-8'
      }
    });

    // TODO DEBUG OSM-BEZEICHNUNG
    console.log('OSM-Bezeichnung: Overpass HTTP-Status.', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      // TODO DEBUG OSM-BEZEICHNUNG
      console.warn('OSM-Bezeichnung: Overpass-Fehlerantwort.', errorText);
      return '';
    }

    const data = (await response.json()) as OverpassResponse;
    const elements = Array.isArray(data.elements) ? data.elements : [];
    const roads = getRoadCandidates(elements, lon, lat);
    const addresses = getAddressCandidates(elements, lon, lat);
    const bezeichnung = buildBezeichnung(roads, addresses);

    // TODO DEBUG OSM-BEZEICHNUNG
    console.log('OSM-Bezeichnung: Overpass-Treffer ausgewertet.', {
      elementCount: elements.length,
      firstElements: elements.slice(0, 5).map((element) => ({
        type: element.type,
        id: element.id,
        lat: element.lat,
        lon: element.lon,
        center: element.center,
        geometryPoints: element.geometry?.length ?? 0,
        tags: element.tags,
        isStreetWay: isStreetWay(element),
        isAddressElement: isAddressElement(element),
        isPoiElement: isPoiElement(element)
      })),
      roads,
      addresses: addresses.slice(0, 5),
      bezeichnung
    });

    return bezeichnung;
  } catch (error) {
    // TODO DEBUG OSM-BEZEICHNUNG
    console.warn('OSM-Bezeichnung konnte nicht erzeugt werden.', error);
    return '';
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function generateAdministrativeFieldsFromOsm(
  lon: number,
  lat: number,
  options: GenerateOsmBezeichnungOptions = {}
): Promise<AdministrativeFields> {
  if (!isFiniteCoordinate(lon, lat)) {
    // TODO DEBUG OSM-BEZEICHNUNG
    console.warn('OSM-Verwaltungsfelder: Ungueltige WGS84-Koordinate.', {
      lon,
      lat,
      originalCoordinate: options.originalCoordinate
    });
    return { kreis: null, kommune: null };
  }

  const query = buildAdministrativeOverpassQuery(lon, lat);

  // TODO DEBUG OSM-BEZEICHNUNG
  console.log('OSM-Verwaltungsfelder: Anfrage wird vorbereitet.', {
    originalOpenLayersCoordinate: options.originalCoordinate,
    lonLat: { lon, lat },
    query
  });

  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, OSM_OVERPASS_TIMEOUT_MS);

  try {
    const response = await fetch(OVERPASS_API_URL, {
      method: 'POST',
      body: query,
      signal: controller.signal,
      headers: {
        'content-type': 'text/plain;charset=UTF-8'
      }
    });

    // TODO DEBUG OSM-BEZEICHNUNG
    console.log('OSM-Verwaltungsfelder: Overpass HTTP-Status.', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      // TODO DEBUG OSM-BEZEICHNUNG
      console.warn('OSM-Verwaltungsfelder: Overpass-Fehlerantwort.', errorText);
      return { kreis: null, kommune: null };
    }

    const data = (await response.json()) as OverpassAreaResponse;
    const elements = Array.isArray(data.elements) ? data.elements : [];
    const fields = selectAdministrativeFields(elements);

    // TODO DEBUG OSM-BEZEICHNUNG
    console.log('OSM-Verwaltungsfelder: Overpass-Treffer ausgewertet.', {
      elementCount: elements.length,
      firstElements: elements.slice(0, 10).map((element) => ({
        type: element.type,
        id: element.id,
        tags: element.tags
      })),
      fields
    });

    return fields;
  } catch (error) {
    // TODO DEBUG OSM-BEZEICHNUNG
    console.warn('OSM-Verwaltungsfelder konnten nicht erzeugt werden.', error);
    return { kreis: null, kommune: null };
  } finally {
    window.clearTimeout(timeout);
  }
}

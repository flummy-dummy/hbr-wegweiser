const NRW_OBJECTS_ENDPOINT = 'https://radservice.radroutenplaner.nrw.de/rrp/nrwrvn/cgi/service/objects';
const NRW_POI_DETAIL_ENDPOINT = 'https://www.radroutenplaner.nrw.de/rrpPoiVerzweigungInfo.asp';
const NRW_POI_CATEGORIES = [
  'Zielwegweiser NRW',
  'Zwischenwegweiser NRW',
  'Knotenpunkt NRW'
];
const NRW_SEARCH_RADII_METERS = [5, 10, 25, 50, 100] as const;
const NRW_MAX_MATCH_DISTANCE_METERS = 100;
const NRW_REFERENCE_KATASTERKENNUNG = 'MS053-1';

export type NrwKatasterResult = {
  katasterkennung: string | null;
  knotenKennung: string | null;
  pfostenKennung: string | null;
  pfostenNr: string | null;
  nr: string | null;
  category: string | null;
  rawValue: string | null;
  objectId: string | null;
  offizielleKnotenNr: string | null;
  kommune: string | null;
  knotenpunktNr: string | null;
  sourceUrl?: string | null;
  relatedPfosten?: NrwPfostenCandidate[];
};

export type NrwPfostenCandidate = {
  pfostenKennung: string;
  pfostenNr: string;
  rawValue: string;
  objectId: string;
  lon: number | null;
  lat: number | null;
};

type NrwPoiCandidate = NrwKatasterResult & {
  value: string;
  category: string | null;
  nr: string | null;
  x: number | null;
  y: number | null;
  distanceMeters: number;
};

type FindNrwKatasterOptions = {
  originalCoordinate?: readonly [number, number] | null;
};

type SearchAttempt = {
  radiusMeters: number;
  axisOrder: 'xy' | 'yx-debug';
  requestBody: string;
  status: number | null;
  ok: boolean;
  rawResponse: string;
  objectCount: number;
  candidateCount: number;
  error?: unknown;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function lonLatToUtm32(lon: number, lat: number): { x: number; y: number } {
  const semiMajorAxis = 6378137;
  const flattening = 1 / 298.257222101;
  const scale = 0.9996;
  const centralMeridian = ((32 * 6 - 183) * Math.PI) / 180;
  const eccentricitySquared = flattening * (2 - flattening);
  const secondEccentricitySquared = eccentricitySquared / (1 - eccentricitySquared);
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const nu = semiMajorAxis / Math.sqrt(1 - eccentricitySquared * sinPhi * sinPhi);
  const t = tanPhi * tanPhi;
  const c = secondEccentricitySquared * cosPhi * cosPhi;
  const a = cosPhi * (lambda - centralMeridian);
  const meridianArc =
    semiMajorAxis *
    ((1 - eccentricitySquared / 4 - (3 * eccentricitySquared ** 2) / 64 - (5 * eccentricitySquared ** 3) / 256) * phi -
      ((3 * eccentricitySquared) / 8 +
        (3 * eccentricitySquared ** 2) / 32 +
        (45 * eccentricitySquared ** 3) / 1024) *
        Math.sin(2 * phi) +
      ((15 * eccentricitySquared ** 2) / 256 + (45 * eccentricitySquared ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * eccentricitySquared ** 3) / 3072) * Math.sin(6 * phi));

  return {
    x:
      500000 +
      scale *
        nu *
        (a +
          ((1 - t + c) * a ** 3) / 6 +
          ((5 - 18 * t + t * t + 72 * c - 58 * secondEccentricitySquared) * a ** 5) / 120),
    y:
      scale *
      (meridianArc +
        nu *
          tanPhi *
          ((a * a) / 2 +
            ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 +
            ((61 - 58 * t + t * t + 600 * c - 330 * secondEccentricitySquared) * a ** 6) / 720))
  };
}

function utm32ToLonLat(x: number, y: number): { lon: number; lat: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const semiMajorAxis = 6378137;
  const flattening = 1 / 298.257222101;
  const scale = 0.9996;
  const centralMeridian = ((32 * 6 - 183) * Math.PI) / 180;
  const eccentricitySquared = flattening * (2 - flattening);
  const secondEccentricitySquared = eccentricitySquared / (1 - eccentricitySquared);
  const eccentricityPrime =
    (1 - Math.sqrt(1 - eccentricitySquared)) / (1 + Math.sqrt(1 - eccentricitySquared));
  const meridianArc = y / scale;
  const mu =
    meridianArc /
    (semiMajorAxis *
      (1 - eccentricitySquared / 4 - (3 * eccentricitySquared ** 2) / 64 - (5 * eccentricitySquared ** 3) / 256));
  const footprintLatitude =
    mu +
    ((3 * eccentricityPrime) / 2 - (27 * eccentricityPrime ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * eccentricityPrime ** 2) / 16 - (55 * eccentricityPrime ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * eccentricityPrime ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * eccentricityPrime ** 4) / 512) * Math.sin(8 * mu);
  const sinFootprint = Math.sin(footprintLatitude);
  const cosFootprint = Math.cos(footprintLatitude);
  const tanFootprint = Math.tan(footprintLatitude);
  const c = secondEccentricitySquared * cosFootprint * cosFootprint;
  const t = tanFootprint * tanFootprint;
  const radiusOfCurvature =
    semiMajorAxis / Math.sqrt(1 - eccentricitySquared * sinFootprint * sinFootprint);
  const meridianRadius =
    (semiMajorAxis * (1 - eccentricitySquared)) /
    (1 - eccentricitySquared * sinFootprint * sinFootprint) ** 1.5;
  const d = (x - 500000) / (radiusOfCurvature * scale);
  const lat =
    footprintLatitude -
    ((radiusOfCurvature * tanFootprint) / meridianRadius) *
      (d ** 2 / 2 -
        ((5 + 3 * t + 10 * c - 4 * c * c - 9 * secondEccentricitySquared) * d ** 4) / 24 +
        ((61 + 90 * t + 298 * c + 45 * t * t - 252 * secondEccentricitySquared - 3 * c * c) * d ** 6) /
          720);
  const lon =
    centralMeridian +
    (d -
      ((1 + 2 * t + c) * d ** 3) / 6 +
      ((5 - 2 * c + 28 * t - 3 * c * c + 8 * secondEccentricitySquared + 24 * t * t) * d ** 5) / 120) /
      cosFootprint;
  const result = {
    lon: (lon * 180) / Math.PI,
    lat: (lat * 180) / Math.PI
  };

  return Number.isFinite(result.lon) && Number.isFinite(result.lat) ? result : null;
}

function buildPoiSearchRequest(x: number, y: number, radiusMeters: number): string {
  const x1 = x - radiusMeters;
  const y1 = y - radiusMeters;
  const x2 = x + radiusMeters;
  const y2 = y + radiusMeters;

  return `<Request><ObjectInfo><ObjectSearch><CoordinateRectangle srsName="urn:adv:crs:ETRS89_UTM32">${x1},${y1},${x2},${y2}</CoordinateRectangle><Classes><POI/></Classes></ObjectSearch><Options><Output><SRSName>urn:adv:crs:ETRS89_UTM32</SRSName></Output></Options></ObjectInfo></Request>`;
}

function buildReferenceSearchRequest(): string {
  return `<Request><ObjectInfo><ObjectSearch><String>${escapeXml(NRW_REFERENCE_KATASTERKENNUNG)}</String><Classes><POI/></Classes></ObjectSearch><Options><Output><SRSName>urn:adv:crs:ETRS89_UTM32</SRSName></Output></Options></ObjectInfo></Request>`;
}

function getText(element: Element, selector: string): string | null {
  return element.querySelector(selector)?.textContent?.trim() || null;
}

function extractKatasterkennung(value: string): string | null {
  return value.match(/\b[A-ZÄÖÜ]{1,4}\d{2,4}(?:-\d+)?\b/u)?.[0] ?? null;
}

function splitKatasterkennung(value: string | null): {
  knotenKennung: string | null;
  pfostenKennung: string | null;
  pfostenNr: string | null;
} {
  const match = value?.match(/^([A-ZÄÖÜ]{1,4}\d{2,4})(?:-(\d+))?$/u);

  if (!match) {
    return {
      knotenKennung: null,
      pfostenKennung: null,
      pfostenNr: null
    };
  }

  return {
    knotenKennung: match[1],
    pfostenKennung: match[2] ? value : null,
    pfostenNr: match[2] ?? null
  };
}

function extractKommune(value: string): string | null {
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : null;
}

function extractKnotenpunktNr(value: string): string | null {
  return value.match(/\bKP\s*0*(\d{1,3})\b/i)?.[1] ?? null;
}

function extractOfficialNumber(value: string): string | null {
  return value.match(/\b\d{7,9}\b/)?.[0] ?? null;
}

function getObjectCount(rawXml: string): number {
  const parser = new DOMParser();
  const documentXml = parser.parseFromString(rawXml, 'application/xml');
  return documentXml.querySelectorAll('Object').length;
}

function isPotentialKatasterObject(value: string, category: string | null, nr: string | null): boolean {
  const haystack = `${value} ${category ?? ''} ${nr ?? ''}`.toLocaleLowerCase('de-DE');

  return (
    Boolean(extractKatasterkennung(value)) ||
    haystack.includes('katasterkennung') ||
    haystack.includes('poi-nr') ||
    haystack.includes('zielwegweiser') ||
    haystack.includes('zwischenwegweiser') ||
    haystack.includes('knotenpunkt') ||
    Boolean(nr)
  );
}

function buildPoiDetailUrl(nr: string, category: string): string {
  const params = new URLSearchParams({ layer: category, dbspalte: nr });
  return `${NRW_POI_DETAIL_ENDPOINT}?${params.toString()}`;
}

async function getSourceUrl(nr: string | null, category: string | null): Promise<string | null> {
  if (!nr || !category) {
    return null;
  }

  const detailRequest = buildPoiDetailUrl(nr, category);

  try {
    const response = await fetch(detailRequest);
    const rawText = await readResponseText(response);
    const sourceUrl = rawText.match(/https?:\/\/[^<\s"']+/)?.[0] ?? detailRequest;

    // TODO DEBUG NRW-KATASTER
    console.log('NRW-Kataster: Detailseite ausgewertet.', {
      detailRequest,
      status: response.status,
      rawResponse: rawText,
      sourceUrl
    });

    return sourceUrl;
  } catch (error) {
    // TODO DEBUG NRW-KATASTER
    console.warn('NRW-Kataster: Detailseite konnte nicht geladen werden.', { detailRequest, error });
    return detailRequest;
  }
}

async function readResponseText(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  const charset = contentType.match(/charset=([^;\s]+)/i)?.[1] ?? '';
  const buffer = await response.arrayBuffer();
  let decoder: TextDecoder;

  try {
    decoder = new TextDecoder(charset || 'iso-8859-15');
  } catch {
    decoder = new TextDecoder('utf-8');
  }

  return decoder.decode(buffer);
}

function parseCandidates(rawXml: string, x: number, y: number): NrwPoiCandidate[] {
  const parser = new DOMParser();
  const documentXml = parser.parseFromString(rawXml, 'application/xml');
  const objects = Array.from(documentXml.querySelectorAll('Object'));

  return objects
    .flatMap((objectElement) => {
      const type = getText(objectElement, 'Type');
      const objectId = getText(objectElement, 'ID');
      const value = getText(objectElement, 'Value') ?? '';
      const coords = getText(objectElement, 'Coords')?.split(',').map(Number) ?? [];
      const nr = getText(objectElement, 'POI > Nr');
      const category = getText(objectElement, 'POI > Category');
      const katasterkennung = extractKatasterkennung(value);
      const splitKennung = splitKatasterkennung(katasterkennung);
      const objectX = Number.isFinite(coords[0]) ? coords[0] : null;
      const objectY = Number.isFinite(coords[1]) ? coords[1] : null;

      if (
        type !== 'POI' ||
        !katasterkennung ||
        !isPotentialKatasterObject(value, category, nr) ||
        objectX === null ||
        objectY === null
      ) {
        return [];
      }

      const distanceMeters = Math.hypot(objectX - x, objectY - y);

      if (distanceMeters > NRW_MAX_MATCH_DISTANCE_METERS) {
        return [];
      }

      return [
        {
          katasterkennung,
          knotenKennung: splitKennung.knotenKennung,
          pfostenKennung: splitKennung.pfostenKennung,
          pfostenNr: splitKennung.pfostenNr,
          offizielleKnotenNr: extractOfficialNumber(value),
          kommune: extractKommune(value),
          knotenpunktNr: extractKnotenpunktNr(value),
          sourceUrl: null,
          rawValue: value,
          objectId,
          value,
          category,
          nr,
          x: objectX,
          y: objectY,
          distanceMeters
        }
      ];
    })
    .sort((left, right) => left.distanceMeters - right.distanceMeters);
}

async function postObjectSearch(requestBody: string): Promise<{ response: Response; rawResponse: string }> {
  const response = await fetch(NRW_OBJECTS_ENDPOINT, {
    method: 'POST',
    body: requestBody,
    headers: {
      'content-type': 'text/xml;charset=UTF-8'
    }
  });
  const rawResponse = await readResponseText(response);
  return { response, rawResponse };
}

async function runReferenceSearch(): Promise<void> {
  const requestBody = buildReferenceSearchRequest();

  // TODO DEBUG NRW-KATASTER
  console.log('TODO DEBUG NRW-KATASTER Referenztest: Anfrage wird vorbereitet.', {
    endpoint: NRW_OBJECTS_ENDPOINT,
    katasterkennung: NRW_REFERENCE_KATASTERKENNUNG,
    requestBody
  });

  try {
    const { response, rawResponse } = await postObjectSearch(requestBody);

    // TODO DEBUG NRW-KATASTER
    console.log('TODO DEBUG NRW-KATASTER Referenztest: Antwort erhalten.', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      objectCount: getObjectCount(rawResponse),
      rawResponse
    });
  } catch (error) {
    // TODO DEBUG NRW-KATASTER
    console.warn('TODO DEBUG NRW-KATASTER Referenztest: Anfrage fehlgeschlagen.', error);
  }
}

async function findRelatedPfostenCandidates(
  knotenKennung: string | null,
  x: number,
  y: number
): Promise<NrwPfostenCandidate[]> {
  if (!knotenKennung) {
    return [];
  }

  const requestBody = buildPoiSearchRequest(x, y, NRW_MAX_MATCH_DISTANCE_METERS);
  const { response, rawResponse } = await postObjectSearch(requestBody);

  if (!response.ok) {
    return [];
  }

  const parser = new DOMParser();
  const documentXml = parser.parseFromString(rawResponse, 'application/xml');
  const objects = Array.from(documentXml.querySelectorAll('Object'));
  const knotenKennungen = new Set(
    objects.flatMap((objectElement) => {
      if (getText(objectElement, 'Type') !== 'POI') {
        return [];
      }

      const splitKennung = splitKatasterkennung(extractKatasterkennung(getText(objectElement, 'Value') ?? ''));
      return splitKennung.knotenKennung ? [splitKennung.knotenKennung] : [];
    })
  );

  if (knotenKennungen.size !== 1 || !knotenKennungen.has(knotenKennung)) {
    console.log('NRW-Kataster: Automatische Pfostenzuordnung wegen mehrdeutiger Knotenkennung ausgelassen.', {
      selectedKnotenKennung: knotenKennung,
      foundKnotenKennungen: Array.from(knotenKennungen)
    });
    return [];
  }

  const relatedPfosten = new Map<string, NrwPfostenCandidate>();

  for (const objectElement of objects) {
    if (getText(objectElement, 'Type') !== 'POI') {
      continue;
    }

    const katasterkennung = extractKatasterkennung(getText(objectElement, 'Value') ?? '');
    const splitKennung = splitKatasterkennung(katasterkennung);

    if (
      splitKennung.knotenKennung !== knotenKennung ||
      !splitKennung.pfostenKennung ||
      !splitKennung.pfostenNr
    ) {
      continue;
    }

    const coords = getText(objectElement, 'Coords')?.split(',').map(Number) ?? [];
    const objectX = Number.isFinite(coords[0]) ? coords[0] : null;
    const objectY = Number.isFinite(coords[1]) ? coords[1] : null;

    if (objectX !== null && objectY !== null && Math.hypot(objectX - x, objectY - y) > NRW_MAX_MATCH_DISTANCE_METERS) {
      continue;
    }

    const transformedCoordinate = objectX !== null && objectY !== null ? utm32ToLonLat(objectX, objectY) : null;

    relatedPfosten.set(splitKennung.pfostenKennung, {
      pfostenKennung: splitKennung.pfostenKennung,
      pfostenNr: splitKennung.pfostenNr,
      rawValue: getText(objectElement, 'Value') ?? '',
      objectId: getText(objectElement, 'ID') ?? '',
      lon: transformedCoordinate?.lon ?? null,
      lat: transformedCoordinate?.lat ?? null
    });
  }

  return Array.from(relatedPfosten.values()).sort(
    (left, right) => Number(left.pfostenNr) - Number(right.pfostenNr)
  );
}

function candidateAsPfosten(candidate: NrwPoiCandidate): NrwPfostenCandidate | null {
  if (!candidate.pfostenKennung || !candidate.pfostenNr || candidate.x === null || candidate.y === null) {
    return null;
  }

  const transformedCoordinate = utm32ToLonLat(candidate.x, candidate.y);

  return {
    pfostenKennung: candidate.pfostenKennung,
    pfostenNr: candidate.pfostenNr,
    rawValue: candidate.rawValue ?? '',
    objectId: candidate.objectId ?? '',
    lon: transformedCoordinate?.lon ?? null,
    lat: transformedCoordinate?.lat ?? null
  };
}

export async function findNrwKatasterkennungForCoordinate(
  lon: number,
  lat: number,
  options: FindNrwKatasterOptions = {}
): Promise<NrwKatasterResult | null> {
  const transformedCoordinate = lonLatToUtm32(lon, lat);
  const attempts: SearchAttempt[] = [];

  // TODO DEBUG NRW-KATASTER
  console.log('TODO DEBUG NRW-KATASTER Anfrage wird vorbereitet.', {
    originalOpenLayersCoordinate: options.originalCoordinate,
    lonLat: { lon, lat },
    transformedCoordinate,
    endpoint: NRW_OBJECTS_ENDPOINT,
    triedRadii: NRW_SEARCH_RADII_METERS
  });

  await runReferenceSearch();

  try {
    for (const radiusMeters of NRW_SEARCH_RADII_METERS) {
      const requestBody = buildPoiSearchRequest(transformedCoordinate.x, transformedCoordinate.y, radiusMeters);

      // TODO DEBUG NRW-KATASTER
      console.log('TODO DEBUG NRW-KATASTER Radius-Suche: Anfrage.', {
        radiusMeters,
        axisOrder: 'xy',
        transformedX: transformedCoordinate.x,
        transformedY: transformedCoordinate.y,
        endpoint: NRW_OBJECTS_ENDPOINT,
        requestBody
      });

      const { response, rawResponse } = await postObjectSearch(requestBody);
      const objectCount = getObjectCount(rawResponse);
      const candidates = response.ok ? parseCandidates(rawResponse, transformedCoordinate.x, transformedCoordinate.y) : [];

      attempts.push({
        radiusMeters,
        axisOrder: 'xy',
        requestBody,
        status: response.status,
        ok: response.ok,
        rawResponse,
        objectCount,
        candidateCount: candidates.length
      });

      // TODO DEBUG NRW-KATASTER
      console.log('TODO DEBUG NRW-KATASTER Radius-Suche: Antwort.', {
        radiusMeters,
        axisOrder: 'xy',
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        objectCount,
        candidateCount: candidates.length,
        rawResponse
      });

      const candidate = candidates[0];

      if (candidate) {
        const [sourceUrl, foundRelatedPfosten] = await Promise.all([
          getSourceUrl(candidate.nr, candidate.category),
          findRelatedPfostenCandidates(candidate.knotenKennung, transformedCoordinate.x, transformedCoordinate.y)
        ]);
        const primaryPfosten = candidateAsPfosten(candidate);
        const relatedPfostenByKennung = new Map(
          foundRelatedPfosten.map((pfosten) => [pfosten.pfostenKennung, pfosten])
        );

        if (primaryPfosten) {
          relatedPfostenByKennung.set(primaryPfosten.pfostenKennung, primaryPfosten);
        }

        const relatedPfosten = Array.from(relatedPfostenByKennung.values()).sort(
          (left, right) => Number(left.pfostenNr) - Number(right.pfostenNr)
        );
        const result = {
          katasterkennung: candidate.katasterkennung,
          knotenKennung: candidate.knotenKennung,
          pfostenKennung: candidate.pfostenKennung,
          pfostenNr: candidate.pfostenNr,
          nr: candidate.nr,
          category: candidate.category,
          rawValue: candidate.rawValue,
          objectId: candidate.objectId,
          offizielleKnotenNr: candidate.offizielleKnotenNr,
          kommune: candidate.kommune,
          knotenpunktNr: candidate.knotenpunktNr,
          sourceUrl,
          relatedPfosten
        };

        // TODO DEBUG NRW-KATASTER
        console.log('TODO DEBUG NRW-KATASTER NRW-Kennung extrahiert.', {
          usedRadiusMeters: radiusMeters,
          rawValue: candidate.value,
          category: candidate.category,
          nr: candidate.nr,
          distanceMeters: candidate.distanceMeters,
          katasterkennung: result.katasterkennung,
          knotenKennung: result.knotenKennung,
          pfostenKennung: result.pfostenKennung,
          pfostenNr: result.pfostenNr,
          offizielleKnotenNr: result.offizielleKnotenNr,
          knotenpunktNr: result.knotenpunktNr,
          kommune: result.kommune,
          relatedPfosten: result.relatedPfosten.map((pfosten) => pfosten.pfostenKennung),
          decision: 'NRW-Kennung ueber korrekte x/y-Achsen gefunden.'
        });

        return result;
      }

      const swappedRequestBody = buildPoiSearchRequest(transformedCoordinate.y, transformedCoordinate.x, radiusMeters);
      const swapped = await postObjectSearch(swappedRequestBody);
      const swappedObjectCount = getObjectCount(swapped.rawResponse);
      const swappedCandidates = swapped.response.ok
        ? parseCandidates(swapped.rawResponse, transformedCoordinate.y, transformedCoordinate.x)
        : [];

      attempts.push({
        radiusMeters,
        axisOrder: 'yx-debug',
        requestBody: swappedRequestBody,
        status: swapped.response.status,
        ok: swapped.response.ok,
        rawResponse: swapped.rawResponse,
        objectCount: swappedObjectCount,
        candidateCount: swappedCandidates.length
      });

      // TODO DEBUG NRW-KATASTER
      console.log('TODO DEBUG NRW-KATASTER Achsen-Test: Antwort mit vertauschtem x/y.', {
        radiusMeters,
        axisOrder: 'yx-debug',
        transformedXAsY: transformedCoordinate.y,
        transformedYAsX: transformedCoordinate.x,
        status: swapped.response.status,
        statusText: swapped.response.statusText,
        ok: swapped.response.ok,
        objectCount: swappedObjectCount,
        candidateCount: swappedCandidates.length,
        rawResponse: swapped.rawResponse,
        decision: swappedCandidates.length > 0 ? 'Nur Debug-Hinweis: vertauschte Achsen liefern Treffer.' : 'Vertauschte Achsen liefern keine Treffer.'
      });
    }

    // TODO DEBUG NRW-KATASTER
    console.log('TODO DEBUG NRW-KATASTER Keine NRW-Kennung gefunden.', {
      transformedX: transformedCoordinate.x,
      transformedY: transformedCoordinate.y,
      endpoint: NRW_OBJECTS_ENDPOINT,
      triedRadii: NRW_SEARCH_RADII_METERS,
      attempts: attempts.map((attempt) => ({
        radiusMeters: attempt.radiusMeters,
        axisOrder: attempt.axisOrder,
        status: attempt.status,
        ok: attempt.ok,
        objectCount: attempt.objectCount,
        candidateCount: attempt.candidateCount,
        rawResponseSnippet: attempt.rawResponse.slice(0, 1000)
      })),
      lastRawResponseSnippet: attempts.at(-1)?.rawResponse.slice(0, 2000) ?? '',
      maxObjectCount: Math.max(0, ...attempts.map((attempt) => attempt.objectCount)),
      decision: 'Keine NRW-Kennung gefunden; Fallback auf vorlaeufige Nummer.'
    });

    return null;
  } catch (error) {
    // TODO DEBUG NRW-KATASTER
    console.warn('TODO DEBUG NRW-KATASTER Anfrage fehlgeschlagen.', {
      transformedX: transformedCoordinate.x,
      transformedY: transformedCoordinate.y,
      endpoint: NRW_OBJECTS_ENDPOINT,
      triedRadii: NRW_SEARCH_RADII_METERS,
      attempts,
      error
    });
    return null;
  }
}

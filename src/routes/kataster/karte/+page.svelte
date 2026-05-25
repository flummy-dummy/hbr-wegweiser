<script lang="ts">
  import { applyAction, enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import KatasterMap from '$lib/components/KatasterMap.svelte';
  import type { GeoJsonGeometry, KatasterMapRecord } from '$lib/kataster';
  import { findNrwKatasterkennungForCoordinate } from '$lib/nrw-kataster';
  import type { NrwPfostenCandidate } from '$lib/nrw-kataster';
  import {
    generateAdministrativeFieldsFromOsm,
    generateKnotenBezeichnungFromOsm
  } from '$lib/osm-knoten-bezeichnung';
  import type { SubmitFunction } from '@sveltejs/kit';

  type DraftPoint = {
    lon: number;
    lat: number;
    originalCoordinate?: readonly [number, number];
  };

  type DraftMode = 'none' | 'create' | 'edit' | 'create-pfosten' | 'edit-pfosten' | 'create-edge' | 'edit-edge';

  type KnotenFormState = {
    success?: boolean;
    action?: string;
    message?: string;
    values?: Record<string, FormDataEntryValue>;
  };

  type EdgeDraft = {
    edgeId: string | null;
    startKnotenId: string;
    endKnotenId: string | null;
    startPoint: DraftPoint;
    endPoint: DraftPoint | null;
    currentPoint: DraftPoint | null;
    coordinates: DraftPoint[];
    selectedVertexIndex: number | null;
  };

  let {
    data,
    form
  }: {
    data: {
      knoten: KatasterMapRecord[];
      pfosten: KatasterMapRecord[];
      kanten: KatasterMapRecord[];
      themenrouten: KatasterMapRecord[];
      knotenpunktverbindungen: KatasterMapRecord[];
      pocketBaseWarning: string | null;
    };
    form?: KnotenFormState;
  } = $props();

  function stringValue(values: Record<string, FormDataEntryValue> | undefined, key: string): string {
    const value = values?.[key];
    return typeof value === 'string' ? value : '';
  }

  function numberValue(raw: string): number | null {
    if (!raw) {
      return null;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseNrwPfostenCandidates(raw: string): NrwPfostenCandidate[] {
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter(
        (entry): entry is NrwPfostenCandidate =>
          Boolean(entry) &&
          typeof entry === 'object' &&
          typeof entry.pfostenKennung === 'string' &&
          typeof entry.pfostenNr === 'string' &&
          typeof entry.rawValue === 'string' &&
          typeof entry.objectId === 'string' &&
          (entry.lon === null || typeof entry.lon === 'number') &&
          (entry.lat === null || typeof entry.lat === 'number')
      );
    } catch {
      return [];
    }
  }

  function knotenpunktFieldValue(value: unknown): string {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 99) {
      return String(value);
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();

      if (!trimmed) {
        return '';
      }

      const parsed = Number(trimmed);

      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 99) {
        return trimmed;
      }
    }

    return '';
  }

  function parseCoordinatesJson(raw: string): DraftPoint[] {
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.flatMap((entry) => {
        if (
          !Array.isArray(entry) ||
          entry.length < 2 ||
          typeof entry[0] !== 'number' ||
          !Number.isFinite(entry[0]) ||
          typeof entry[1] !== 'number' ||
          !Number.isFinite(entry[1])
        ) {
          return [];
        }

        return [{ lon: entry[0], lat: entry[1] }];
      });
    } catch {
      return [];
    }
  }

  function toCoordinatesJson(points: DraftPoint[]): string {
    return JSON.stringify(points.map((point) => [point.lon, point.lat]));
  }

  function simplifyEdgePoints(points: DraftPoint[]): DraftPoint[] {
    if (points.length < 3) {
      return points;
    }

    const simplified: DraftPoint[] = [points[0]];
    const tolerance = 1e-10;

    for (let index = 1; index < points.length - 1; index += 1) {
      const previous = simplified[simplified.length - 1];
      const current = points[index];
      const next = points[index + 1];

      const area =
        (current.lon - previous.lon) * (next.lat - previous.lat) -
        (current.lat - previous.lat) * (next.lon - previous.lon);

      const isCollinear = Math.abs(area) < tolerance;
      const isWithinBounds =
        current.lon >= Math.min(previous.lon, next.lon) - tolerance &&
        current.lon <= Math.max(previous.lon, next.lon) + tolerance &&
        current.lat >= Math.min(previous.lat, next.lat) - tolerance &&
        current.lat <= Math.max(previous.lat, next.lat) + tolerance;

      if (isCollinear && isWithinBounds) {
        continue;
      }

      simplified.push(current);
    }

    simplified.push(points[points.length - 1]);
    return simplified;
  }

  function formValues() {
    return form?.action === 'createKnoten' || form?.action === 'updateKnoten' || form?.action === 'createPfosten' || form?.action === 'updatePfosten' || form?.action === 'deletePfosten' || form?.action === 'createKante' || form?.action === 'updateKante' || form?.action === 'deleteKnoten' || form?.action === 'deleteKante'
      ? form.values
      : undefined;
  }

  function draftModeFromForm(): DraftMode {
    if (form?.action === 'createKnoten') {
      return 'create';
    }

    if (form?.action === 'updateKnoten') {
      return 'edit';
    }

    if (form?.action === 'createPfosten') {
      return 'create-pfosten';
    }

    if (form?.action === 'updatePfosten' || form?.action === 'deletePfosten') {
      return 'edit-pfosten';
    }

    if (form?.action === 'createKante') {
      return 'create-edge';
    }

    if (form?.action === 'updateKante') {
      return 'edit-edge';
    }

    if (form?.action === 'deleteKnoten') {
      return 'edit';
    }

    if (form?.action === 'deleteKante') {
      return 'edit-edge';
    }

    return 'none';
  }

  function findKnotenById(id: string): KatasterMapRecord | null {
    return data.knoten.find((entry) => entry.id === id) ?? null;
  }

  function findKanteById(id: string): KatasterMapRecord | null {
    return data.kanten.find((entry) => entry.id === id) ?? null;
  }

  function findPfostenById(id: string): KatasterMapRecord | null {
    return data.pfosten.find((entry) => entry.id === id) ?? null;
  }

  function geometryToPoints(geometry: GeoJsonGeometry | null): DraftPoint[] {
    if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
      return [];
    }

    return geometry.coordinates.flatMap((coordinate) => {
      if (
        !Array.isArray(coordinate) ||
        coordinate.length < 2 ||
        typeof coordinate[0] !== 'number' ||
        !Number.isFinite(coordinate[0]) ||
        typeof coordinate[1] !== 'number' ||
        !Number.isFinite(coordinate[1])
      ) {
        return [];
      }

      return [{ lon: coordinate[0], lat: coordinate[1] }];
    });
  }

  const initialValues = formValues();
  const initialLon = numberValue(stringValue(initialValues, 'lon'));
  const initialLat = numberValue(stringValue(initialValues, 'lat'));
  const initialDraftPoint =
    initialLon !== null && initialLat !== null ? { lon: initialLon, lat: initialLat } : null;
  const initialDraftMode = initialDraftPoint ? draftModeFromForm() : ['create-edge', 'edit-edge'].includes(draftModeFromForm()) ? draftModeFromForm() : 'none';

  const initialEdgeStartId = stringValue(initialValues, 'start_knoten');
  const initialEdgeEndId = stringValue(initialValues, 'end_knoten');
  const initialEdgeStartKnoten = initialEdgeStartId ? findKnotenById(initialEdgeStartId) : null;
  const initialEdgeEndKnoten = initialEdgeEndId ? findKnotenById(initialEdgeEndId) : null;
  const initialEdgeCoordinates = parseCoordinatesJson(stringValue(initialValues, 'coordinates_json'));
  const initialEdgeDraft =
    ['create-edge', 'edit-edge'].includes(draftModeFromForm()) &&
    initialEdgeStartKnoten &&
    initialEdgeStartKnoten.lon !== null &&
    initialEdgeStartKnoten.lat !== null
      ? {
          edgeId: stringValue(initialValues, 'id') || null,
          startKnotenId: initialEdgeStartKnoten.id,
          endKnotenId: initialEdgeEndId || null,
          startPoint: {
            lon: initialEdgeStartKnoten.lon,
            lat: initialEdgeStartKnoten.lat
          },
          endPoint:
            initialEdgeEndKnoten && initialEdgeEndKnoten.lon !== null && initialEdgeEndKnoten.lat !== null
              ? {
                  lon: initialEdgeEndKnoten.lon,
                  lat: initialEdgeEndKnoten.lat
                }
              : null,
          currentPoint:
            initialEdgeEndKnoten && initialEdgeEndKnoten.lon !== null && initialEdgeEndKnoten.lat !== null
              ? {
                  lon: initialEdgeEndKnoten.lon,
                  lat: initialEdgeEndKnoten.lat
                }
              : null,
          coordinates: initialEdgeCoordinates,
          selectedVertexIndex: null
        }
      : null;

  let draftMode = $state<DraftMode>(initialDraftMode);
  let draftPoint = $state<DraftPoint | null>(initialDraftPoint);
  let edgeDraft = $state<EdgeDraft | null>(initialEdgeDraft);
  let selectedKnotenForPfostenId = $state(stringValue(initialValues, 'knoten'));
  let editingPfostenId = $state(stringValue(initialValues, 'id'));
  let kantenNr = $state(stringValue(initialValues, 'kanten_nr'));
  let kantenStatus = $state(stringValue(initialValues, 'status') || 'planung');
  let kantenArt = $state(stringValue(initialValues, 'art') || 'netzverbindung');
  let linienstil = $state(stringValue(initialValues, 'linienstil') || 'durchgezogen');
  let kantenBemerkung = $state(stringValue(initialValues, 'bemerkung'));
  let kantenAktiv = $state(stringValue(initialValues, 'aktiv') === 'on');
  let editingKnotenId = $state(stringValue(initialValues, 'id'));
  let knotenNr = $state(stringValue(initialValues, 'knoten_nr'));
  let bezeichnung = $state(stringValue(initialValues, 'bezeichnung'));
  let kreis = $state(stringValue(initialValues, 'kreis'));
  let kommune = $state(stringValue(initialValues, 'kommune'));
  let katasterkennung = $state(stringValue(initialValues, 'knoten_kennung') || stringValue(initialValues, 'katasterkennung'));
  let katasterkennungSubmitValue = $state(stringValue(initialValues, 'katasterkennung'));
  let pfostenKennung = $state(stringValue(initialValues, 'pfosten_kennung'));
  let pfostenNr = $state(stringValue(initialValues, 'pfosten_nr'));
  let pfostenIndex = $state(stringValue(initialValues, 'pfosten_index'));
  let pfostenTyp = $state(stringValue(initialValues, 'pfosten_typ') || stringValue(initialValues, 'typ') || 'bestandsmast');
  let pfostenMaterial = $state(stringValue(initialValues, 'material') || 'metall');
  let pfostenBestandStatus = $state(stringValue(initialValues, 'bestand_status') || 'vorhanden');
  let nrwPoiNr = $state(stringValue(initialValues, 'nrw_poi_nr'));
  let nrwTyp = $state(stringValue(initialValues, 'nrw_typ'));
  let nrwKommune = $state(stringValue(initialValues, 'nrw_kommune'));
  let nrwSourceUrl = $state(stringValue(initialValues, 'nrw_source_url'));
  let nrwRawValue = $state(stringValue(initialValues, 'nrw_raw_value'));
  let nrwObjectId = $state(stringValue(initialValues, 'nrw_object_id'));
  let offizielleKnotenNr = $state(stringValue(initialValues, 'offizielle_knoten_nr'));
  let status = $state(stringValue(initialValues, 'status') || 'bestand');
  let knotenpunktNr = $state(knotenpunktFieldValue(initialValues?.knotenpunkt_nr));
  let bemerkung = $state(stringValue(initialValues, 'bemerkung'));
  let aktiv = $state(stringValue(initialValues, 'aktiv') === 'on');
  let osmBezeichnungStatus = $state<'idle' | 'loading' | 'empty' | 'error'>('idle');
  let nrwKatasterHinweis = $state('');
  let nrwPfostenCandidates = $state<NrwPfostenCandidate[]>(
    parseNrwPfostenCandidates(stringValue(initialValues, 'nrw_pfosten_json'))
  );
  let edgeEditFormElement = $state<HTMLFormElement | null>(null);
  let osmBezeichnungRequestId = 0;
  const canEdit = $derived(page.data.auth?.canEdit === true);
  const visiblePfosten = $derived(data.pfosten.filter((entry) => entry.status !== 'zu_entfernen'));

  const closeDraftOnSuccess: SubmitFunction = () => {
    return async ({ result }) => {
      await applyAction(result);

      if (result.type === 'success') {
        await invalidateAll();
        cancelDraft();
      }
    };
  };

  const submitKnotenWithDebug: SubmitFunction = (submission) => {
    const { formData } = submission;
    const nrwPfostenJson = String(formData.get('nrw_pfosten_json') ?? '');
    const submittedCandidates = parseNrwPfostenCandidates(nrwPfostenJson);

    console.log('NRW-Kataster: Knoten-Submit mit Pfostenkandidaten.', {
      candidateCount: submittedCandidates.length,
      nrwPfostenJson
    });

    return closeDraftOnSuccess(submission);
  };

  function resetFormFields() {
    editingKnotenId = '';
    editingPfostenId = '';
    knotenNr = '';
    bezeichnung = '';
    kreis = '';
    kommune = '';
    katasterkennung = '';
    katasterkennungSubmitValue = '';
    pfostenKennung = '';
    pfostenNr = '';
    pfostenIndex = '';
    pfostenTyp = 'bestandsmast';
    pfostenMaterial = 'metall';
    pfostenBestandStatus = 'vorhanden';
    nrwPoiNr = '';
    nrwTyp = '';
    nrwKommune = '';
    nrwSourceUrl = '';
    nrwRawValue = '';
    nrwObjectId = '';
    offizielleKnotenNr = '';
    status = 'bestand';
    knotenpunktNr = '';
    bemerkung = '';
    aktiv = false;
    osmBezeichnungStatus = 'idle';
    nrwKatasterHinweis = '';
    nrwPfostenCandidates = [];
    selectedKnotenForPfostenId = '';
  }

  function resetEdgeDraft() {
    edgeDraft = null;
    kantenNr = '';
    kantenStatus = 'planung';
    kantenArt = 'netzverbindung';
    linienstil = 'durchgezogen';
    kantenBemerkung = '';
    kantenAktiv = false;
  }

  function startCreationMode() {
    if (!canEdit) {
      return;
    }

    draftMode = 'create';
    draftPoint = null;
    resetEdgeDraft();
    resetFormFields();
  }

  function startEdgeCreationMode() {
    if (!canEdit) {
      return;
    }

    draftMode = 'create-edge';
    draftPoint = null;
    resetEdgeDraft();
    resetFormFields();
  }

  function createNextPfostenValues(knoten: KatasterMapRecord): { kennung: string; nr: string; index: string } {
    const knotenKennung = knoten.formData?.knotenKennung || knoten.formData?.katasterkennung || '';
    const relatedPfosten = data.pfosten.filter((entry) => {
      const pfostenKennung = entry.formData?.pfostenKennung || entry.title;
      return (
        entry.formData?.linkedKnotenId === knoten.id ||
        (Boolean(knotenKennung) && pfostenKennung.startsWith(`${knotenKennung}-`))
      );
    });
    const existingNumbers = relatedPfosten
      .flatMap((entry) => [
        entry.formData?.pfostenIndex ? String(entry.formData.pfostenIndex) : '',
        entry.formData?.pfostenNr ?? '',
        entry.formData?.pfostenKennung ?? '',
        entry.title,
        entry.subtitle ?? ''
      ])
      .map((value) => Number(String(value).match(/\d+$/)?.[0] ?? ''))
      .filter((value) => Number.isInteger(value) && value > 0);
    const nextNumber = Math.max(0, ...existingNumbers) + 1;
    return {
      kennung: knotenKennung ? `${knotenKennung}-${nextNumber}` : '',
      nr: String(nextNumber),
      index: String(nextNumber)
    };
  }

  function startPfostenCreationMode(knotenId: string) {
    if (!canEdit) {
      return;
    }

    const knoten = findKnotenById(knotenId);

    if (!knoten) {
      return;
    }

    const nextPfosten = createNextPfostenValues(knoten);
    draftMode = 'create-pfosten';
    draftPoint = null;
    resetEdgeDraft();
    resetFormFields();
    selectedKnotenForPfostenId = knoten.id;
    pfostenKennung = nextPfosten.kennung;
    pfostenNr = nextPfosten.nr;
    pfostenIndex = nextPfosten.index;
    pfostenTyp = 'bestandsmast';
    pfostenMaterial = 'metall';
    pfostenBestandStatus = 'vorhanden';
  }

  function handleEditPfostenSelect(pfostenId: string) {
    if (!canEdit) {
      return;
    }

    const pfosten = findPfostenById(pfostenId);

    if (!pfosten || pfosten.lon === null || pfosten.lat === null) {
      return;
    }

    draftMode = 'edit-pfosten';
    resetEdgeDraft();
    draftPoint = {
      lon: pfosten.lon,
      lat: pfosten.lat
    };
    editingPfostenId = pfosten.id;
    selectedKnotenForPfostenId = pfosten.formData?.linkedKnotenId ?? '';
    pfostenIndex = pfosten.formData?.pfostenIndex ? String(pfosten.formData.pfostenIndex) : '';
    pfostenNr = pfosten.formData?.pfostenNr ?? pfosten.subtitle ?? pfostenIndex;
    pfostenKennung = pfosten.formData?.pfostenKennung ?? pfosten.title;
    pfostenTyp = pfosten.formData?.pfostenTyp ?? 'bestandsmast';
    pfostenMaterial = pfosten.formData?.pfostenMaterial ?? 'metall';
    pfostenBestandStatus = pfosten.status || 'vorhanden';
    bemerkung = pfosten.formData?.bemerkung ?? '';
    aktiv = pfosten.formData?.aktiv === true;
  }

  function cancelDraft() {
    draftMode = 'none';
    draftPoint = null;
    selectedKnotenForPfostenId = '';
    editingPfostenId = '';
    resetEdgeDraft();
    resetFormFields();
  }

  function handleDraftPointChange(point: DraftPoint | null) {
    draftPoint = point;

    if (
      draftMode === 'create' &&
      point &&
      (!bezeichnung.trim() || !kreis.trim() || !kommune.trim() || !knotenNr.trim())
    ) {
      void suggestKnotenBezeichnungFromOsm(point, false);
    }
  }

  async function suggestKnotenBezeichnungFromOsm(point: DraftPoint | null = draftPoint, force = false) {
    if (
      !point ||
      draftMode !== 'create' ||
      (!force && bezeichnung.trim() && kreis.trim() && kommune.trim() && knotenNr.trim())
    ) {
      return;
    }

    const requestId = ++osmBezeichnungRequestId;
    osmBezeichnungStatus = 'loading';
    nrwPfostenCandidates = [];

    try {
      const [suggestion, administrativeFields, nrwKatasterResult] = await Promise.all([
        generateKnotenBezeichnungFromOsm(point.lon, point.lat, {
          originalCoordinate: point.originalCoordinate ?? null
        }),
        generateAdministrativeFieldsFromOsm(point.lon, point.lat, {
          originalCoordinate: point.originalCoordinate ?? null
        }),
        findNrwKatasterkennungForCoordinate(point.lon, point.lat, {
          originalCoordinate: point.originalCoordinate ?? null
        })
      ]);

      if (requestId !== osmBezeichnungRequestId || draftMode !== 'create') {
        return;
      }

      if (suggestion) {
        if (force || !bezeichnung.trim()) {
          bezeichnung = suggestion;
        }
      }

      if (administrativeFields.kreis && (force || !kreis.trim())) {
        kreis = administrativeFields.kreis;
      }

      if (administrativeFields.kommune && (force || !kommune.trim())) {
        kommune = administrativeFields.kommune;
      }

      if (nrwKatasterResult?.kommune && (force || !kommune.trim())) {
        kommune = nrwKatasterResult.kommune;
      }

      if (nrwKatasterResult?.katasterkennung) {
        katasterkennung = nrwKatasterResult.knotenKennung ?? '';
        katasterkennungSubmitValue = nrwKatasterResult.knotenKennung ?? nrwKatasterResult.katasterkennung;
        pfostenKennung = nrwKatasterResult.pfostenKennung ?? '';
        pfostenNr = nrwKatasterResult.pfostenNr ?? '';
        nrwPoiNr = nrwKatasterResult.nr ?? '';
        nrwTyp = nrwKatasterResult.category ?? '';
        nrwKommune = nrwKatasterResult.kommune ?? '';
        nrwSourceUrl = nrwKatasterResult.sourceUrl ?? '';
        nrwRawValue = nrwKatasterResult.rawValue ?? '';
        nrwObjectId = nrwKatasterResult.objectId ?? '';
        offizielleKnotenNr = normalizeOfficialKnotenNr(nrwKatasterResult.offizielleKnotenNr);
        nrwPfostenCandidates = nrwKatasterResult.relatedPfosten ?? [];

        const nrwKnotenpunktNr = nrwKatasterResult.knotenpunktNr ?? '';

        if (/^\d+$/.test(nrwKnotenpunktNr) && (force || !knotenpunktNr.trim())) {
          knotenpunktNr = nrwKnotenpunktNr;
        }

        if (nrwKatasterResult.knotenKennung) {
          knotenNr = nrwKatasterResult.knotenKennung;
        }
      } else if (force || !knotenNr.trim()) {
        knotenNr = createVorlaeufigeKnotenNr({
          katasterkennung: null,
          kommune: kommune || administrativeFields.kommune || nrwKatasterResult?.kommune || '',
          kreis: administrativeFields.kreis || kreis
        });
      }

      if (nrwKatasterResult?.katasterkennung) {
        const pfostenHinweis = nrwPfostenCandidates.length
          ? ` Zugehoerige Pfosten gefunden: ${nrwPfostenCandidates.map((pfosten) => pfosten.pfostenKennung).join(', ')}.`
          : '';
        nrwKatasterHinweis = `NRW-Knotenkennung gefunden: ${katasterkennung}. Knoten-Nr.: ${knotenNr}.${pfostenHinweis}`;
      } else if (knotenNr.startsWith('VORL-')) {
        nrwKatasterHinweis = `Keine NRW-Katasterkennung gefunden. Vorlaeufige Nummer erzeugt: ${knotenNr}`;
      } else {
        nrwKatasterHinweis = '';
      }

      // TODO DEBUG NRW-KATASTER
      console.log('NRW-Kataster: Entscheidung fuer Knoten-Nummer.', {
        nrwKatasterResult,
        knotenNr,
        knotenpunktNr,
        knotenKennung: katasterkennung,
        pfostenKennung,
        pfostenNr,
        nrwPoiNr,
        nrwTyp,
        nrwKommune,
        nrwSourceUrl,
        nrwRawValue,
        nrwObjectId,
        offizielleKnotenNr,
        decision: nrwKatasterResult?.katasterkennung
          ? 'NRW-Knotenkennung erkannt; knoten_nr entspricht knoten_kennung.'
          : 'Keine NRW-Kennung gefunden; vorlaeufige Nummer erzeugt.'
      });

      if (!suggestion && !administrativeFields.kreis && !administrativeFields.kommune && !nrwKatasterResult) {
        osmBezeichnungStatus = 'empty';
      } else {
        osmBezeichnungStatus = 'idle';
      }
    } catch {
      if (requestId === osmBezeichnungRequestId) {
        osmBezeichnungStatus = 'error';
      }
    }
  }

  function normalizeKommuneKuerzelPart(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/^(Stadt|Gemeinde|Kreis|Landkreis)\s+/i, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase();
  }

  function createKommuneKuerzelFromKatasterkennung(value: string | null | undefined): string | null {
    const match = value?.trim().toUpperCase().match(/^([A-Z]{1,4})\d/);
    return match?.[1] ?? null;
  }

  function splitKatasterkennungForDisplay(value: string): {
    knotenKennung: string;
    pfostenKennung: string;
    pfostenNr: string;
  } {
    const match = value.trim().match(/^([A-ZÄÖÜ]{1,4}\d{2,4})(?:-(\d+))?$/u);

    if (!match) {
      return {
        knotenKennung: value,
        pfostenKennung: '',
        pfostenNr: ''
      };
    }

    return {
      knotenKennung: match[1],
      pfostenKennung: match[2] ? value : '',
      pfostenNr: match[2] ?? ''
    };
  }

  function normalizeOfficialKnotenNr(value: string | null | undefined): string {
    const normalized = value?.trim() ?? '';
    return /^[1-9]\d{6,8}$/.test(normalized) ? normalized : '';
  }

  function createKommuneKuerzelFromAdministrativeFields(...values: string[]): string {
    for (const value of values) {
      const normalized = normalizeKommuneKuerzelPart(value);

      if (!normalized) {
        continue;
      }

      if (normalized === 'MUNSTER') {
        return 'MS';
      }

      return normalized.slice(0, 2);
    }

    return 'UNBEKANNT';
  }

  function createVorlaeufigeKnotenNr(fields: {
    katasterkennung: string | null;
    kommune: string;
    kreis: string;
  }): string {
    const kommuneKuerzel =
      createKommuneKuerzelFromKatasterkennung(fields.katasterkennung) ??
      createKommuneKuerzelFromAdministrativeFields(fields.kommune, fields.kreis);
    const prefix = `VORL-${kommuneKuerzel}-`;
    const existingNumbers = data.knoten
      .map((knoten) => knoten.formData?.knotenNr ?? knoten.subtitle ?? '')
      .filter((nummer) => nummer.startsWith(prefix))
      .map((nummer) => Number(nummer.slice(prefix.length)))
      .filter((nummer) => Number.isInteger(nummer));
    const nextNumber = Math.max(0, ...existingNumbers) + 1;
    const result = `${prefix}${String(nextNumber).padStart(4, '0')}`;

    // TODO DEBUG NRW-KATASTER
    console.log('NRW-Kataster: Vorlaeufige Nummer erzeugt.', {
      ...fields,
      kommuneKuerzel,
      existingNumbers,
      result
    });

    return result;
  }

  function handleEditKnotenSelect(knotenId: string) {
    if (!canEdit) {
      return;
    }

    if (draftMode === 'create-edge' || draftMode === 'edit-edge') {
      return;
    }

    const knoten = findKnotenById(knotenId);

    if (!knoten || knoten.lon === null || knoten.lat === null) {
      return;
    }

    draftMode = 'edit';
    resetEdgeDraft();
    draftPoint = {
      lon: knoten.lon,
      lat: knoten.lat
    };
    editingKnotenId = knoten.id;
    knotenNr = knoten.formData?.knotenNr ?? knoten.subtitle ?? '';
    bezeichnung = knoten.formData?.bezeichnung ?? '';
    kreis = knoten.formData?.kreis ?? '';
    kommune = knoten.formData?.kommune ?? '';
    const storedKatasterkennung = knoten.formData?.katasterkennung ?? '';
    const storedKnotenKennung = knoten.formData?.knotenKennung ?? '';
    const splitKennung = splitKatasterkennungForDisplay(storedKnotenKennung || storedKatasterkennung);
    katasterkennung = storedKnotenKennung || splitKennung.knotenKennung;
    katasterkennungSubmitValue = storedKatasterkennung;
    pfostenKennung = knoten.formData?.pfostenKennung || splitKennung.pfostenKennung;
    pfostenNr = knoten.formData?.pfostenNr || splitKennung.pfostenNr;
    nrwPoiNr = knoten.formData?.nrwPoiNr ?? '';
    nrwTyp = knoten.formData?.nrwTyp ?? '';
    nrwKommune = knoten.formData?.nrwKommune ?? '';
    nrwSourceUrl = knoten.formData?.nrwSourceUrl ?? '';
    nrwRawValue = knoten.formData?.nrwRawValue || storedKatasterkennung;
    nrwObjectId = knoten.formData?.nrwObjectId ?? '';
    offizielleKnotenNr = knoten.formData?.offizielleKnotenNr ?? '';
    nrwKatasterHinweis = '';
    nrwPfostenCandidates = [];
    status = knoten.status || 'bestand';
    knotenpunktNr = knotenpunktFieldValue(knoten.formData?.knotenpunktNr);
    bemerkung = knoten.formData?.bemerkung ?? '';
    aktiv = knoten.formData?.aktiv === true;
  }

  function handleEdgeHoverChange(point: DraftPoint | null) {
    if (!edgeDraft || edgeDraft.endPoint) {
      return;
    }

    edgeDraft = {
      ...edgeDraft,
      currentPoint: point
    };
  }

  function createEdgeCoordinates(startPoint: DraftPoint, endPoint: DraftPoint): DraftPoint[] {
    return [{ ...startPoint }, { ...endPoint }];
  }

  function handleEdgeNodeSelect(knotenId: string) {
    if (!canEdit || draftMode !== 'create-edge') {
      return;
    }

    const knoten = findKnotenById(knotenId);

    if (!knoten || knoten.lon === null || knoten.lat === null) {
      return;
    }

    if (!edgeDraft) {
      edgeDraft = {
        edgeId: null,
        startKnotenId: knoten.id,
        endKnotenId: null,
        startPoint: {
          lon: knoten.lon,
          lat: knoten.lat
        },
        endPoint: null,
        currentPoint: {
          lon: knoten.lon,
          lat: knoten.lat
        },
        coordinates: [],
        selectedVertexIndex: null
      };
      return;
    }

    if (edgeDraft.startKnotenId === knoten.id) {
      return;
    }

    const nextEndPoint = {
      lon: knoten.lon,
      lat: knoten.lat
    };

    edgeDraft = {
      ...edgeDraft,
      endKnotenId: knoten.id,
      endPoint: nextEndPoint,
      currentPoint: nextEndPoint,
      coordinates: createEdgeCoordinates(edgeDraft.startPoint, nextEndPoint),
      selectedVertexIndex: null
    };

    if (!kantenNr) {
      kantenNr = `kante-${edgeDraft.startKnotenId.slice(0, 6)}-${knoten.id.slice(0, 6)}`;
    }
  }

  function handleEdgeFeatureSelect(kanteId: string) {
    if (!canEdit || draftMode === 'create-edge') {
      return;
    }

    const kante = findKanteById(kanteId);

    if (!kante || kante.geomJson?.type !== 'LineString') {
      return;
    }

    const coordinates = geometryToPoints(kante.geomJson);

    if (coordinates.length < 2) {
      return;
    }

    const startKnoten = kante.formData?.startKnotenId ? findKnotenById(kante.formData.startKnotenId) : null;
    const endKnoten = kante.formData?.endKnotenId ? findKnotenById(kante.formData.endKnotenId) : null;

    if (!startKnoten || !endKnoten || startKnoten.lon === null || startKnoten.lat === null || endKnoten.lon === null || endKnoten.lat === null) {
      return;
    }

    draftMode = 'edit-edge';
    draftPoint = null;
    edgeDraft = {
      edgeId: kante.id,
      startKnotenId: startKnoten.id,
      endKnotenId: endKnoten.id,
      startPoint: { lon: startKnoten.lon, lat: startKnoten.lat },
      endPoint: { lon: endKnoten.lon, lat: endKnoten.lat },
      currentPoint: { lon: endKnoten.lon, lat: endKnoten.lat },
      coordinates,
      selectedVertexIndex: null
    };
    kantenNr = kante.formData?.kantenNr ?? kante.title;
    kantenStatus = kante.status || 'planung';
    kantenArt = kante.formData?.kantenArt ?? kante.subtitle ?? 'netzverbindung';
    linienstil = kante.formData?.kantenLinienstil ?? 'durchgezogen';
    kantenBemerkung = kante.formData?.bemerkung ?? '';
    kantenAktiv = kante.formData?.aktiv === true;
  }

  function handleEdgeVertexSelect(index: number | null) {
    if (!edgeDraft || index === null) {
      if (edgeDraft) {
        edgeDraft = { ...edgeDraft, selectedVertexIndex: null };
      }
      return;
    }

    edgeDraft = { ...edgeDraft, selectedVertexIndex: index };
  }

  function handleEdgeGeometryChange(points: DraftPoint[]) {
    if (!edgeDraft || points.length < 2) {
      return;
    }

    const normalizedPoints = simplifyEdgePoints(points);
    const nextStartPoint = normalizedPoints[0] ?? edgeDraft.startPoint;
    const nextEndPoint = normalizedPoints[normalizedPoints.length - 1] ?? edgeDraft.endPoint;

    edgeDraft = {
      ...edgeDraft,
      startPoint: nextStartPoint,
      endPoint: nextEndPoint,
      coordinates: normalizedPoints,
      currentPoint: nextEndPoint ?? edgeDraft.currentPoint,
      selectedVertexIndex: null
    };
  }

  function removeSelectedVertex() {
    if (
      !edgeDraft ||
      edgeDraft.selectedVertexIndex === null ||
      edgeDraft.selectedVertexIndex <= 0 ||
      edgeDraft.selectedVertexIndex >= edgeDraft.coordinates.length - 1
    ) {
      return;
    }

    const selectedVertexIndex = edgeDraft.selectedVertexIndex;
    const nextCoordinates = edgeDraft.coordinates.filter((_, index) => index !== selectedVertexIndex);

    edgeDraft = {
      ...edgeDraft,
      coordinates: nextCoordinates,
      selectedVertexIndex: null
    };
  }

  function requestEdgeSave() {
    edgeEditFormElement?.requestSubmit();
  }

  function handleWindowKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || draftMode === 'none') {
      return;
    }

    event.preventDefault();
    cancelDraft();
  }
</script>

<svelte:head>
  <title>Katasterkarte | HBR-Wegweiser-Generator</title>
</svelte:head>

<svelte:window onkeydown={handleWindowKeyDown} />

<main class="page kataster-page">
  <header class="editor-header">
    <a href="/">Startseite</a>
    <h1>Katasterkarte</h1>
    <p>OpenStreetMap-Basiskarte mit Knoten, Pfosten und Kanten aus dem Beschilderungskataster.</p>
  </header>

  {#if data.pocketBaseWarning}
    <p class="form-message error-message">{data.pocketBaseWarning}</p>
  {/if}

  {#if form?.message}
    <p class:success-message={form.success} class:error-message={!form.success} class="form-message">
      {form.message}
    </p>
  {/if}

  <section class="panel kataster-panel">
    <div class="kataster-toolbar">
      <span>Knoten: {data.knoten.length}</span>
      <span>Pfosten: {visiblePfosten.length}</span>
      <span>Kanten: {data.kanten.length}</span>
      <span>Themenrouten: {data.themenrouten.length}</span>
      <span>Knotenpunktverbindungen: {data.knotenpunktverbindungen.length}</span>
    </div>

    <div class="kataster-edit-toolbar">
      {#if canEdit}
        <button
          type="button"
          class:secondary-button={draftMode !== 'create'}
          class:kataster-mode-button-active={draftMode === 'create'}
          class="button"
          onclick={startCreationMode}
        >
          Knoten setzen
        </button>
        <button
          type="button"
          class:secondary-button={draftMode !== 'create-edge'}
          class:kataster-mode-button-active={draftMode === 'create-edge'}
          class="button"
          onclick={startEdgeCreationMode}
        >
          Kante erstellen
        </button>
      {/if}

      {#if !canEdit}
        <span class="kataster-mode-hint">Nur Lesezugriff. Karte sichtbar, Bearbeitung gesperrt.</span>
      {:else if draftMode === 'create'}
        <span class="kataster-mode-hint">
          {#if draftPoint}
            Punkt gesetzt. Formular ausfuellen oder mit einem neuen Kartenklick verschieben.
          {:else}
            Modus aktiv. Klicke in die Karte, um einen neuen Knoten zu setzen.
          {/if}
        </span>
      {:else if draftMode === 'edit'}
        <span class="kataster-mode-hint">
          Bearbeiten aktiv. Position per Kartenklick oder Drag anpassen und dann speichern.
        </span>
      {:else if draftMode === 'create-pfosten'}
        <span class="kataster-mode-hint">
          {#if draftPoint}
            Pfostenposition gesetzt. Pfostendaten pruefen und speichern.
          {:else}
            Pfosten-Setzmodus aktiv. Bitte Position des Pfostens in der Karte anklicken.
          {/if}
        </span>
      {:else if draftMode === 'edit-pfosten'}
        <span class="kataster-mode-hint">
          Pfosten bearbeiten. Position per Kartenklick oder Drag anpassen und dann speichern.
        </span>
      {:else if draftMode === 'create-edge'}
        <span class="kataster-mode-hint">
          {#if edgeDraft?.endKnotenId}
            Start und Ziel stehen. Linie direkt auf der Karte in den Strassenverlauf ziehen oder speichern.
          {:else if edgeDraft}
            Startknoten gesetzt. Jetzt Zielknoten waehlen.
          {:else}
            Modus aktiv. Einen bestehenden Knoten als Startknoten anklicken.
          {/if}
        </span>
      {:else if draftMode === 'edit-edge'}
        <span class="kataster-mode-hint">
          Kante bearbeiten: Linie oder vorhandene Stuetzpunkte direkt auf der Karte in Form ziehen.
        </span>
      {/if}
    </div>

    <div class="kataster-edit-layout">
      <KatasterMap
        knoten={data.knoten}
        pfosten={visiblePfosten}
        kanten={data.kanten}
        themenrouten={data.themenrouten}
        knotenpunktverbindungen={data.knotenpunktverbindungen}
        {draftMode}
        {draftPoint}
        {edgeDraft}
        {canEdit}
        onDraftPointChange={handleDraftPointChange}
        onEditKnotenSelect={handleEditKnotenSelect}
        onEdgeNodeSelect={handleEdgeNodeSelect}
        onEdgeHoverChange={handleEdgeHoverChange}
        onEdgeFeatureSelect={handleEdgeFeatureSelect}
        onPfostenCreateRequest={startPfostenCreationMode}
        onPfostenEditRequest={handleEditPfostenSelect}
        onEdgeVertexSelect={handleEdgeVertexSelect}
        onEdgeGeometryChange={handleEdgeGeometryChange}
        onEdgeEditSaveRequest={requestEdgeSave}
      />

      {#if draftMode !== 'none'}
        <section class="kataster-create-panel">
          {#if form?.message}
            <p class:success-message={form.success} class:error-message={!form.success} class="kataster-form-message">
              {form.message}
            </p>
          {/if}

          {#if draftMode === 'create-edge' || draftMode === 'edit-edge'}
            <h2>{draftMode === 'create-edge' ? 'Neue Kante anlegen' : 'Kante bearbeiten'}</h2>

            {#if edgeDraft}
              <p class="kataster-create-coordinates">
                Stuetzpunkte: {edgeDraft.coordinates.length}. Start und Ende koennen mit der Linie verschoben werden; die zugehoerigen Knoten werden beim Speichern mit aktualisiert.
              </p>
            {:else}
              <p class="kataster-create-coordinates">Klicke zuerst eine Kante oder einen Startknoten an.</p>
            {/if}

            <form
              bind:this={edgeEditFormElement}
              method="POST"
              action={draftMode === 'create-edge' ? '?/createKante' : '?/updateKante'}
              class="admin-form"
              use:enhance={closeDraftOnSuccess}
            >
              {#if draftMode === 'edit-edge'}
                <input type="hidden" name="id" value={edgeDraft?.edgeId ?? ''} />
              {/if}
              <input type="hidden" name="start_knoten" value={edgeDraft?.startKnotenId ?? ''} />
              <input type="hidden" name="end_knoten" value={edgeDraft?.endKnotenId ?? ''} />
              <input type="hidden" name="coordinates_json" value={toCoordinatesJson(edgeDraft?.coordinates ?? [])} />

              <label class="field">
                <span>Kanten-Nr.</span>
                <input name="kanten_nr" bind:value={kantenNr} required />
              </label>

              <label class="field">
                <span>Status</span>
                <select name="status" bind:value={kantenStatus} required>
                  <option value="bestand">Bestand</option>
                  <option value="planung">Planung</option>
                  <option value="temporär">Temporär</option>
                  <option value="entfallen">Entfallen</option>
                </select>
              </label>

              <label class="field">
                <span>Art</span>
                <select name="art" bind:value={kantenArt} required>
                  <option value="netzverbindung">Netzverbindung</option>
                  <option value="themenroute">Themenroute</option>
                  <option value="knotenpunktverbindung">Knotenpunktverbindung</option>
                  <option value="sonstige">Sonstige</option>
                </select>
              </label>

              <label class="field">
                <span>Linienstil</span>
                <select name="linienstil" bind:value={linienstil} required>
                  <option value="durchgezogen">Durchgezogen</option>
                  <option value="gestrichelt">Gestrichelt</option>
                  <option value="punktiert">Punktiert</option>
                </select>
              </label>

              <label class="field">
                <span>Bemerkung</span>
                <textarea name="bemerkung" rows="4" bind:value={kantenBemerkung}></textarea>
              </label>

              <label class="kataster-checkbox-field">
                <input name="aktiv" type="checkbox" bind:checked={kantenAktiv} />
                <span>Aktiv</span>
              </label>

              <div class="kataster-create-actions">
                <button
                  class="button secondary-button"
                  type="button"
                  onclick={removeSelectedVertex}
                  disabled={edgeDraft?.selectedVertexIndex === null}
                >
                  Ausgewaehlten Zwischenpunkt loeschen
                </button>
              </div>

              {#if draftMode === 'edit-edge'}
                <div class="kataster-create-actions">
                  <button
                    class="button danger-button"
                    type="submit"
                    formaction="?/deleteKante"
                    name="id"
                    value={edgeDraft?.edgeId ?? ''}
                  >
                    Kante loeschen
                  </button>
                </div>
              {/if}

              <div class="kataster-create-actions kataster-create-actions-primary">
                <button class="button danger-button button-small" type="button" onclick={cancelDraft}>
                  Abbrechen
                </button>
                <button
                  class="button button-large"
                  type="submit"
                  disabled={!edgeDraft?.startKnotenId || !edgeDraft?.endKnotenId || (edgeDraft?.coordinates.length ?? 0) < 2}
                >
                  Speichern
                </button>
              </div>
            </form>
          {:else if draftMode === 'create-pfosten' || draftMode === 'edit-pfosten'}
            <h2>{draftMode === 'create-pfosten' ? 'Neuen Pfosten anlegen' : 'Pfosten bearbeiten'}</h2>

            {#if draftPoint}
              <p class="kataster-create-coordinates">
                Position: Lon {draftPoint.lon.toFixed(6)}, Lat {draftPoint.lat.toFixed(6)}
              </p>
            {:else}
              <p class="kataster-create-coordinates">
                Bitte Position des Pfostens in der Karte anklicken.
              </p>
            {/if}

            <form
              method="POST"
              action={draftMode === 'create-pfosten' ? '?/createPfosten' : '?/updatePfosten'}
              class="admin-form"
              use:enhance={closeDraftOnSuccess}
            >
              {#if draftMode === 'edit-pfosten'}
                <input type="hidden" name="id" value={editingPfostenId} />
              {/if}
              <input type="hidden" name="knoten" value={selectedKnotenForPfostenId} />
              <input type="hidden" name="lon" value={draftPoint ? String(draftPoint.lon) : ''} />
              <input type="hidden" name="lat" value={draftPoint ? String(draftPoint.lat) : ''} />

              <fieldset class="kataster-form-section">
                <legend>Pfosten-Daten</legend>
                <div class="field-row two-columns">
                  <label class="field">
                    <span>Laufende Pfostennummer <strong aria-hidden="true">*</strong></span>
                    <input name="pfosten_index" type="number" min="1" step="1" bind:value={pfostenIndex} readonly required />
                  </label>

                  <label class="field">
                    <span>Pfostenkennung</span>
                    <input name="pfosten_kennung" bind:value={pfostenKennung} />
                  </label>
                </div>

                <div class="field-row two-columns">
                  <label class="field">
                    <span>Pfosten-Nr. <strong aria-hidden="true">*</strong></span>
                    <input name="pfosten_nr" bind:value={pfostenNr} required />
                  </label>
                </div>

                <div class="field-row two-columns">
                  <label class="field">
                    <span>Typ <strong aria-hidden="true">*</strong></span>
                    <input name="typ" bind:value={pfostenTyp} required />
                  </label>

                  <label class="field">
                    <span>Material <strong aria-hidden="true">*</strong></span>
                    <input name="material" bind:value={pfostenMaterial} required />
                  </label>
                </div>

                <label class="field">
                  <span>Bestand-Status <strong aria-hidden="true">*</strong></span>
                  <select name="bestand_status" bind:value={pfostenBestandStatus} required>
                    <option value="vorhanden">Vorhanden</option>
                    <option value="geplant">Geplant</option>
                    <option value="zu_entfernen">Zu entfernen</option>
                    <option value="ersetzt">Ersetzt</option>
                  </select>
                </label>

                <label class="field">
                  <span>Bemerkung</span>
                  <textarea name="bemerkung" rows="3" bind:value={bemerkung}></textarea>
                </label>

                <label class="kataster-checkbox-field">
                  <input name="aktiv" type="checkbox" bind:checked={aktiv} />
                  <span>Aktiv</span>
                </label>
              </fieldset>

              <fieldset class="kataster-form-section">
                <legend>Geometrie / Position</legend>
                <div class="field-row two-columns">
                  <label class="field">
                    <span>Longitude</span>
                    <input value={draftPoint ? String(draftPoint.lon) : ''} readonly />
                  </label>
                  <label class="field">
                    <span>Latitude</span>
                    <input value={draftPoint ? String(draftPoint.lat) : ''} readonly />
                  </label>
                </div>
              </fieldset>

              {#if draftMode === 'edit-pfosten'}
                <div class="kataster-create-actions">
                  <button
                    class="button danger-button"
                    type="submit"
                    formaction="?/deletePfosten"
                    name="id"
                    value={editingPfostenId}
                  >
                    Pfosten loeschen
                  </button>
                </div>
              {/if}

              <div class="kataster-create-actions kataster-create-actions-primary">
                <button class="button danger-button button-small" type="button" onclick={cancelDraft}>
                  Abbrechen
                </button>
                <button
                  class="button button-large"
                  type="submit"
                  disabled={!selectedKnotenForPfostenId || !draftPoint || !pfostenIndex.trim() || !pfostenNr.trim() || !pfostenTyp.trim() || !pfostenMaterial.trim() || !pfostenBestandStatus.trim() || (draftMode === 'edit-pfosten' && !editingPfostenId)}
                >
                  Speichern
                </button>
              </div>
            </form>
          {:else}
            <h2>{draftMode === 'create' ? 'Neuen Knoten anlegen' : 'Knoten bearbeiten'}</h2>

            {#if draftPoint}
              <p class="kataster-create-coordinates">
                Position: Lon {draftPoint.lon.toFixed(6)}, Lat {draftPoint.lat.toFixed(6)}
              </p>
            {:else}
              <p class="kataster-create-coordinates">Klicke zuerst in die Karte, um die Position zu setzen.</p>
            {/if}

            <form
              method="POST"
              action={draftMode === 'create' ? '?/createKnoten' : '?/updateKnoten'}
              class="admin-form"
              use:enhance={submitKnotenWithDebug}
            >
              {#if draftMode === 'edit'}
                <input type="hidden" name="id" value={editingKnotenId} />
              {/if}
              <input type="hidden" name="lon" value={draftPoint ? String(draftPoint.lon) : ''} />
              <input type="hidden" name="lat" value={draftPoint ? String(draftPoint.lat) : ''} />
              <input type="hidden" name="pfosten_kennung" value={pfostenKennung} />
              <input type="hidden" name="pfosten_nr" value={pfostenNr} />
              <input type="hidden" name="nrw_pfosten_json" value={JSON.stringify(nrwPfostenCandidates)} />

              <fieldset class="kataster-form-section">
                <legend>Knoten-Daten</legend>
                <div class="field-row two-columns">
                  <label class="field">
                    <span>Knoten-Nr. <strong aria-hidden="true">*</strong></span>
                    <input name="knoten_nr" bind:value={knotenNr} required />
                  </label>

                  <label class="field">
                    <span>Status <strong aria-hidden="true">*</strong></span>
                    <select name="status" bind:value={status} required>
                      <option value="bestand">Bestand</option>
                      <option value="planung">Planung</option>
                      <option value="entfallen">Entfallen</option>
                    </select>
                  </label>
                </div>

                <label class="field">
                  <span>Bezeichnung</span>
                  <input name="bezeichnung" bind:value={bezeichnung} />
                </label>

                <div class="field-row two-columns">
                  <label class="field">
                    <span>Kreis</span>
                    <input name="kreis" bind:value={kreis} />
                  </label>

                  <label class="field">
                    <span>Kommune</span>
                    <input name="kommune" bind:value={kommune} />
                  </label>
                </div>

                <label class="field">
                  <span>Knotenpunkt-Nr.</span>
                  <input
                    name="knotenpunkt_nr"
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    placeholder="optional, 1-99"
                    bind:value={knotenpunktNr}
                  />
                </label>
              </fieldset>

              {#if draftMode === 'create'}
                <div class="kataster-create-actions">
                  <button
                    class="button secondary-button button-small"
                    type="button"
                    onclick={() => suggestKnotenBezeichnungFromOsm(draftPoint, true)}
                    disabled={!draftPoint || osmBezeichnungStatus === 'loading'}
                  >
                    {osmBezeichnungStatus === 'loading' ? 'OSM wird abgefragt...' : 'Aus OSM aktualisieren'}
                  </button>
                </div>

                {#if osmBezeichnungStatus === 'empty'}
                  <p class="kataster-create-coordinates">Keine passenden OSM-Daten gefunden.</p>
                {:else if osmBezeichnungStatus === 'error'}
                  <p class="kataster-create-coordinates">OSM-Daten konnten nicht geladen werden.</p>
                {/if}

                {#if nrwKatasterHinweis}
                  <p class="kataster-create-coordinates">{nrwKatasterHinweis}</p>
                {/if}
              {/if}

              <fieldset class="kataster-form-section">
                <legend>NRW- / Katasterdaten</legend>
                <div class="field-row two-columns">
                  <label class="field">
                    <span>Katasterkennung</span>
                    <input name="katasterkennung" bind:value={katasterkennungSubmitValue} />
                  </label>

                  <label class="field">
                    <span>Knotenkennung</span>
                    <input name="knoten_kennung" bind:value={katasterkennung} />
                  </label>
                </div>

                <label class="field">
                  <span>Offizielle Knoten-Nr.</span>
                  <input
                    name="offizielle_knoten_nr"
                    bind:value={offizielleKnotenNr}
                    inputmode="numeric"
                    placeholder="nur aus offizieller Quelle"
                  />
                </label>

                <div class="field-row two-columns">
                  <label class="field">
                    <span>NRW-POI-Nr.</span>
                    <input name="nrw_poi_nr" bind:value={nrwPoiNr} />
                  </label>

                  <label class="field">
                    <span>NRW-Kategorie</span>
                    <input name="nrw_typ" bind:value={nrwTyp} />
                  </label>
                </div>

                <div class="field-row two-columns">
                  <label class="field">
                    <span>NRW-Kommune</span>
                    <input name="nrw_kommune" bind:value={nrwKommune} />
                  </label>

                  <label class="field">
                    <span>NRW-Object-ID</span>
                    <input name="nrw_object_id" bind:value={nrwObjectId} />
                  </label>
                </div>

                <label class="field">
                  <span>NRW-Rohwert</span>
                  <input name="nrw_raw_value" bind:value={nrwRawValue} />
                </label>

                <label class="field">
                  <span>NRW-Quell-URL</span>
                  <input name="nrw_source_url" bind:value={nrwSourceUrl} />
                </label>
              </fieldset>

              {#if !katasterkennung && knotenNr.startsWith('VORL-')}
                <div class="kataster-create-coordinates">
                  Keine NRW-Katasterkennung gefunden. Vorlaeufige Nummer: {knotenNr}
                </div>
              {/if}

              <fieldset class="kataster-form-section">
                <legend>Geometrie / Position</legend>
                <div class="field-row two-columns">
                  <label class="field">
                    <span>Longitude</span>
                    <input value={draftPoint ? String(draftPoint.lon) : ''} readonly />
                  </label>
                  <label class="field">
                    <span>Latitude</span>
                    <input value={draftPoint ? String(draftPoint.lat) : ''} readonly />
                  </label>
                </div>
              </fieldset>

              <fieldset class="kataster-form-section">
                <legend>Weitere Angaben</legend>
                <label class="field">
                  <span>Bemerkung</span>
                  <textarea name="bemerkung" rows="3" bind:value={bemerkung}></textarea>
                </label>

                <label class="kataster-checkbox-field">
                  <input name="aktiv" type="checkbox" bind:checked={aktiv} />
                  <span>Aktiv</span>
                </label>
              </fieldset>

              {#if draftMode === 'edit'}
                <div class="kataster-create-actions">
                  <button
                    class="button danger-button"
                    type="submit"
                    formaction="?/deleteKnoten"
                    name="id"
                    value={editingKnotenId}
                  >
                    Knoten loeschen
                  </button>
                </div>
              {/if}

              <div class="kataster-create-actions kataster-create-actions-primary">
                <button class="button danger-button button-small" type="button" onclick={cancelDraft}>
                  Abbrechen
                </button>
                <button
                  class="button button-large"
                  type="submit"
                  disabled={!draftPoint || !knotenNr.trim() || !status.trim() || (draftMode === 'edit' && !editingKnotenId)}
                >
                  Speichern
                </button>
              </div>
            </form>
          {/if}
        </section>
      {/if}
    </div>
  </section>
</main>

<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { KatasterFeatureInfo, KatasterMapRecord, KatasterWegweiserInfo } from '$lib/kataster';
  import { gradZuHimmelsrichtung } from '$lib/utils/himmelsrichtung';
  import {
    wegweiserAutomaticSideOffsetStepPx,
    wegweiserBodyHeightPx,
    wegweiserBodyWidthPx,
    wegweiserGapPx,
    wegweiserMinimumDistancePx
  } from '$lib/kataster-map';
  import Feature from 'ol/Feature';
  import type Collection from 'ol/Collection';
  import type Geometry from 'ol/geom/Geometry';
  import LineString from 'ol/geom/LineString';
  import Point from 'ol/geom/Point';
  import type Modify from 'ol/interaction/Modify';
  import type Map from 'ol/Map';
  import { fromLonLat, toLonLat } from 'ol/proj';
  import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
  import 'ol/ol.css';
  import { normalizeHimmelsrichtungGrad } from '$lib/utils/himmelsrichtung';

  type DraftPoint = {
    lon: number;
    lat: number;
    originalCoordinate?: readonly [number, number];
  };

  type DraftMode = 'none' | 'create' | 'edit' | 'create-pfosten' | 'edit-pfosten' | 'create-edge' | 'edit-edge';

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

  type KatasterMapModule = typeof import('$lib/kataster-map');

  let {
    knoten = [],
    pfosten = [],
    kanten = [],
    themenrouten = [],
    knotenpunktverbindungen = [],
    wegweiser = [],
    focusPfostenId = '',
    draftMode = 'none',
    draftPoint = null,
    edgeDraft = null,
    canEdit = false,
    onDraftPointChange = (_point: DraftPoint | null) => {},
    onEditKnotenSelect = (_knotenId: string) => {},
    onEdgeNodeSelect = (_knotenId: string) => {},
    onEdgeHoverChange = (_point: DraftPoint | null) => {},
    onEdgeFeatureSelect = (_kanteId: string) => {},
    onPfostenCreateRequest = (_knotenId: string) => {},
    onPfostenEditRequest = (_pfostenId: string) => {},
    onWegweiserOrientationChangeRequest = (_wegweiserId: string, _grad: number) => {},
    onWegweiserPlacementChangeRequest = (_wegweiserId: string, _darstellungsAbstand: number, _seitlicherVersatz: number) => {},
    onWegweiserAddRequest = (_pfostenId: string) => {},
    onWegweiserEditRequest = (_wegweiserId: string, _pfostenId: string) => {},
    onWegweiserUnlinkRequest = (_wegweiserId: string, _pfostenId: string) => {},
    onEdgeVertexSelect = (_index: number | null) => {},
    onEdgeGeometryChange = (_points: DraftPoint[]) => {},
    onEdgeEditSaveRequest = () => {}
  }: {
    knoten: KatasterMapRecord[];
    pfosten: KatasterMapRecord[];
    kanten: KatasterMapRecord[];
    themenrouten: KatasterMapRecord[];
    knotenpunktverbindungen: KatasterMapRecord[];
    wegweiser: KatasterWegweiserInfo[];
    focusPfostenId?: string;
    draftMode?: DraftMode;
    draftPoint?: DraftPoint | null;
    edgeDraft?: EdgeDraft | null;
    canEdit?: boolean;
    onDraftPointChange?: (point: DraftPoint | null) => void;
    onEditKnotenSelect?: (knotenId: string) => void;
    onEdgeNodeSelect?: (knotenId: string) => void;
    onEdgeHoverChange?: (point: DraftPoint | null) => void;
    onEdgeFeatureSelect?: (kanteId: string) => void;
    onPfostenCreateRequest?: (knotenId: string) => void;
    onPfostenEditRequest?: (pfostenId: string) => void;
    onWegweiserOrientationChangeRequest?: (wegweiserId: string, grad: number) => void;
    onWegweiserPlacementChangeRequest?: (wegweiserId: string, darstellungsAbstand: number, seitlicherVersatz: number) => void;
    onWegweiserAddRequest?: (pfostenId: string) => void;
    onWegweiserEditRequest?: (wegweiserId: string, pfostenId: string) => void;
    onWegweiserUnlinkRequest?: (wegweiserId: string, pfostenId: string) => void;
    onEdgeVertexSelect?: (index: number | null) => void;
    onEdgeGeometryChange?: (points: DraftPoint[]) => void;
    onEdgeEditSaveRequest?: () => void;
  } = $props();

  let mapElement = $state<HTMLDivElement | null>(null);
  let selectedFeatureInfo = $state<KatasterFeatureInfo | null>(null);
  let isMapReady = $state(false);

  let katasterMapModule: KatasterMapModule | null = null;
  let knotenSource: any = null;
  let pfostenSource: any = null;
  let wegweiserSource: any = null;
  let kantenSource: any = null;
  let themenrouteSource: any = null;
  let verbindungSource: any = null;
  let draftSource: any = null;
  let edgeDraftSource: any = null;
  let edgeVertexSource: any = null;
  let translateInteraction: any = null;
  let edgeModifyInteraction: Modify | null = null;
  let dragPanInteraction: any = null;
  let mapInstance: Map | null = null;
  let draftFeatureCollection: Collection<Feature<Geometry>> | null = null;
  let isSpacePressed = $state(false);
  let isPanDragging = $state(false);
  let rotatingWegweiserId = $state('');
  let rotatingWegweiserPfostenCenter: [number, number] | null = null;
  let rotatingWegweiserGrad = $state(0);
  let rotatingWegweiserOriginalGrad = $state(0);
  let movingWegweiserId = $state('');
  let movingWegweiserAnchorPixel: [number, number] | null = null;
  let movingWegweiserBodyOffset: [number, number] | null = null;
  let movingWegweiserPointerDownPixel: [number, number] | null = null;
  let movingWegweiserPointerCandidateId = $state('');
  let movingWegweiserOriginalDistance = $state(0);
  let movingWegweiserOriginalSideOffset = $state(0);
  let movingWegweiserOriginalManuellPositioniert = $state(false);

  function shouldUseRightButtonPan(event: MouseEvent | PointerEvent): boolean {
    return event.button === 2 || event.buttons === 2;
  }

  function shouldUseMiddleButtonPan(event: MouseEvent | PointerEvent): boolean {
    return event.button === 1 || event.buttons === 4;
  }

  function shouldUseSpacePan(event: MouseEvent | PointerEvent): boolean {
    return isSpacePressed && (event.button === 0 || event.buttons === 1);
  }

  function isPanPointerEvent(event: MouseEvent | PointerEvent): boolean {
    return shouldUseRightButtonPan(event) || shouldUseMiddleButtonPan(event) || shouldUseSpacePan(event);
  }

  function isMouseLikeEvent(event: Event): event is MouseEvent | PointerEvent {
    return event instanceof MouseEvent || event instanceof PointerEvent;
  }

  function updateMapCursor() {
    if (!mapElement) {
      return;
    }

    mapElement.style.cursor =
      isPanDragging || Boolean(movingWegweiserId) || Boolean(movingWegweiserPointerCandidateId) || Boolean(rotatingWegweiserId)
        ? 'grabbing'
        : isSpacePressed
          ? 'grab'
          : '';
  }

  const draftPointStyle = new Style({
    image: new CircleStyle({
      radius: 8,
      fill: new Fill({ color: '#f59e0b' }),
      stroke: new Stroke({ color: '#ffffff', width: 3 })
    })
  });

  const edgeDraftStyle = new Style({
    stroke: new Stroke({
      color: '#f59e0b',
      width: 3,
      lineDash: [8, 6]
    })
  });

  const edgeVertexDefaultStyle = new Style({
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({ color: '#f59e0b' }),
      stroke: new Stroke({ color: '#ffffff', width: 2 })
    })
  });

  const edgeVertexEndpointStyle = new Style({
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color: '#b45309' }),
      stroke: new Stroke({ color: '#ffffff', width: 2 })
    })
  });

  const edgeVertexSelectedStyle = new Style({
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color: '#1d4ed8' }),
      stroke: new Stroke({ color: '#ffffff', width: 2 })
    })
  });

  function createDraftPointFeatures(point: DraftPoint | null): Feature<Geometry>[] {
    if (!point) {
      return [];
    }

    return [
      new Feature({
        geometry: new Point(fromLonLat([point.lon, point.lat]))
      }) as Feature<Geometry>
    ];
  }

  function createEdgeDraftFeatures(draft: EdgeDraft | null): Feature<Geometry>[] {
    if (!draft) {
      return [];
    }

    const coordinates =
      draft.coordinates.length >= 2
        ? draft.coordinates
        : draft.currentPoint
          ? [draft.startPoint, draft.currentPoint]
          : [];

    if (coordinates.length < 2) {
      return [];
    }

    return [
      new Feature({
        geometry: new LineString(coordinates.map((point) => fromLonLat([point.lon, point.lat])))
      }) as Feature<Geometry>
    ];
  }

  function createEdgeVertexFeatures(draft: EdgeDraft | null): Feature<Geometry>[] {
    if (!draft || draft.coordinates.length < 2) {
      return [];
    }

    return draft.coordinates.map((point, index) => {
      const feature = new Feature({
        geometry: new Point(fromLonLat([point.lon, point.lat]))
      }) as Feature<Geometry>;
      feature.set('vertexIndex', index);
      feature.set('isEndpointVertex', index === 0 || index === draft.coordinates.length - 1);
      return feature;
    });
  }

  function getEdgeVertexStyle(feature: Feature<Geometry>): Style {
    const vertexIndex = feature.get('vertexIndex');
    const isEndpointVertex = feature.get('isEndpointVertex') === true;

    if (typeof vertexIndex === 'number' && edgeDraft?.selectedVertexIndex === vertexIndex) {
      return edgeVertexSelectedStyle;
    }

    return isEndpointVertex ? edgeVertexEndpointStyle : edgeVertexDefaultStyle;
  }

  function getRelatedPfostenForKnoten(knotenId: string): KatasterFeatureInfo['relatedPfosten'] {
    return pfosten
      .filter((entry) => entry.formData?.linkedKnotenId === knotenId)
      .map((entry) => ({
        id: entry.id,
        title: entry.formData?.pfostenKennung || entry.title,
        subtitle: entry.formData?.pfostenTyp || entry.subtitle,
        status: entry.status,
        pfostenIndex: entry.formData?.pfostenIndex ?? null
      }));
  }

  function getWegweiserPfostenPosition(wegweiserInfo: KatasterWegweiserInfo): [number, number] | null {
    const selectedPfosten = pfosten.find((entry) => entry.id === wegweiserInfo.pfostenId);

    if (!selectedPfosten || selectedPfosten.lon === null || selectedPfosten.lat === null) {
      return null;
    }

    return fromLonLat([selectedPfosten.lon, selectedPfosten.lat]) as [number, number];
  }

  function getWegweiserById(wegweiserId: string): KatasterWegweiserInfo | null {
    return wegweiser.find((entry) => entry.id === wegweiserId) ?? null;
  }

  function getWegweiserFeatureById(wegweiserId: string): Feature<Geometry> | null {
    return (wegweiserSource?.getFeatureById?.(wegweiserId) as Feature<Geometry> | undefined) ?? null;
  }

  function createWegweiserFeatures(): Feature<Geometry>[] {
    const groupedByPfostenUndRichtung = new globalThis.Map<string, KatasterWegweiserInfo[]>();

    [...wegweiser].forEach((entry) => {
      if (!entry.pfostenId) {
        return;
      }

      const richtungKey = `${entry.pfostenId}:${normalizeHimmelsrichtungGrad(entry.himmelsrichtungGrad ?? 0)}`;
      const richtungEntries = groupedByPfostenUndRichtung.get(richtungKey) ?? [];
      richtungEntries.push(entry);
      groupedByPfostenUndRichtung.set(richtungKey, richtungEntries);
    });

    return [...wegweiser]
      .sort((left, right) => {
        const pfostenCompare = (left.pfostenId ?? '').localeCompare(right.pfostenId ?? '');

        if (pfostenCompare !== 0) {
          return pfostenCompare;
        }

        return (left.anzeigeReihenfolge ?? 0) - (right.anzeigeReihenfolge ?? 0);
      })
      .flatMap((entry) => {
        const center = getWegweiserPfostenPosition(entry);

        if (!center) {
          return [];
        }

        const richtungKey = `${entry.pfostenId ?? ''}:${normalizeHimmelsrichtungGrad(entry.himmelsrichtungGrad ?? 0)}`;
        const siblings = groupedByPfostenUndRichtung.get(richtungKey) ?? [];
        const manualPlacement = entry.darstellungsAbstand !== undefined || entry.seitlicherVersatz !== undefined;
        const autoSiblings = siblings.filter(
          (candidate) => candidate.darstellungsAbstand === undefined && candidate.seitlicherVersatz === undefined
        );
        const sortedAutoSiblings = [...autoSiblings].sort(
          (left, right) => (left.anzeigeReihenfolge ?? 0) - (right.anzeigeReihenfolge ?? 0)
        );
        const siblingIndex = sortedAutoSiblings.findIndex((candidate) => candidate.id === entry.id);
        const automaticSideOffsetPx =
          !manualPlacement && siblingIndex >= 0
            ? (siblingIndex - (sortedAutoSiblings.length - 1) / 2) * wegweiserAutomaticSideOffsetStepPx
            : 0;
        const effectiveDistancePx = entry.darstellungsAbstand ?? wegweiserMinimumDistancePx;
        const effectiveSideOffsetPx =
          entry.seitlicherVersatz !== undefined ? entry.seitlicherVersatz : automaticSideOffsetPx;

        const feature = new Feature({
          geometry: new Point(center)
        }) as Feature<Geometry>;
        feature.setId(entry.id);
        feature.setProperties({
          id: entry.id,
          collection: 'wegweiser',
          title: entry.title,
          subtitle: entry.wegweiser_nr ?? entry.kataster_wegweiser_nr ?? '',
          status: entry.status ?? '',
          pfostenId: entry.pfostenId,
          himmelsrichtungGrad: entry.himmelsrichtungGrad ?? 0,
          himmelsrichtungText: entry.himmelsrichtungText ?? 'Norden',
          darstellungsAbstand: effectiveDistancePx,
          seitlicherVersatz: effectiveSideOffsetPx,
          anzeigeReihenfolge: entry.anzeigeReihenfolge ?? 0,
          automatischeVerteilungSeitlich: automaticSideOffsetPx,
          manuellPositioniert: manualPlacement,
          wegweiserRichtungKey: richtungKey
        });
        return [feature];
      });
  }

  function syncWegweiserFeatureState(wegweiserId: string, grad: number) {
    const feature = getWegweiserFeatureById(wegweiserId);

    if (!feature) {
      return;
    }

    feature.set('himmelsrichtungGrad', grad);
    feature.set('himmelsrichtungText', gradZuHimmelsrichtung(grad));
    feature.changed();
    wegweiserSource?.changed();
    mapInstance?.render();
  }

  function wegweiserNumberLine(wegweiserInfo: NonNullable<KatasterFeatureInfo['relatedWegweiser']>[number]): string {
    return [
      wegweiserInfo.wegweiser_nr || 'keine interne Nr.',
      `Offizielle Nr.: ${wegweiserInfo.offizielle_wegweiser_nr || '-'}`,
      `Kataster: ${wegweiserInfo.kataster_wegweiser_nr || '-'}`
    ].join('  ');
  }

  function wegweiserStatusLine(status: string | undefined): string {
    return `Status: ${status || 'kein Status'}`;
  }

  function wegweiserDirectionLine(wegweiserInfo: KatasterWegweiserInfo): string {
    const grad = Math.trunc(wegweiserInfo.himmelsrichtungGrad ?? 0);
    return `${wegweiserInfo.himmelsrichtungText || 'Norden'} (${grad}°)`;
  }

  function pfostenDetails(record: KatasterMapRecord): KatasterFeatureInfo['details'] {
    const entries = [
      ['Pfostenkennung', record.formData?.pfostenKennung],
      ['Laufende Pfostennummer', record.formData?.pfostenIndex ? String(record.formData.pfostenIndex) : undefined],
      ['Pfosten-Nr.', record.formData?.pfostenNr],
      ['Typ', record.formData?.pfostenTyp],
      ['Material', record.formData?.pfostenMaterial],
      ['Foto-Kennung', record.formData?.pfostenFotoKennung],
      ['NRW-Rohwert', record.formData?.nrwRawValue],
      ['NRW-Object-ID', record.formData?.nrwObjectId]
    ] as const;

    return entries.flatMap(([label, value]) => (value ? [{ label, value }] : []));
  }

  function selectPfostenRecord(record: KatasterMapRecord) {
    selectedFeatureInfo = {
      id: record.id,
      collection: 'pfosten',
      title: record.title,
      subtitle: record.subtitle,
      status: record.status || 'ohne Status',
      details: pfostenDetails(record),
      relatedWegweiser: record.relatedWegweiser ?? []
    };
  }

  function selectWegweiserRecord(record: KatasterWegweiserInfo) {
    const pfostenRecord = pfosten.find((entry) => entry.id === record.pfostenId) ?? null;

    selectedFeatureInfo = {
      id: record.id,
      collection: 'wegweiser',
      title: record.title,
      subtitle: record.wegweiser_nr || record.kataster_wegweiser_nr || undefined,
      status: record.status || 'ohne Status',
      details: [
        { label: 'Pfosten', value: pfostenRecord?.title ?? record.pfostenId ?? '' },
        { label: 'Himmelsrichtung', value: wegweiserDirectionLine(record) }
      ]
    };
  }

  function getSelectedFeatureInfo(feature: Feature<Geometry>): KatasterFeatureInfo {
    const info = katasterMapModule?.getFeatureInfo(feature) ?? {
      id: feature.get('id') || String(feature.getId() ?? ''),
      collection: feature.get('collection'),
      title: feature.get('title'),
      subtitle: feature.get('subtitle') || undefined,
      status: feature.get('status') || 'ohne Status'
    };

    if (feature.get('collection') !== 'knoten') {
      if (feature.get('collection') !== 'pfosten') {
        return info;
      }

      const featureId = feature.get('id') ?? feature.getId();
      const selectedPfosten =
        typeof featureId === 'string' ? pfosten.find((entry) => entry.id === featureId) : null;

      return {
        ...info,
        relatedWegweiser: selectedPfosten?.relatedWegweiser ?? []
      };
    }

    const featureId = feature.get('id') ?? feature.getId();

    return {
      ...info,
      relatedPfosten: typeof featureId === 'string' ? getRelatedPfostenForKnoten(featureId) : []
    };
  }

  function refreshSources() {
    if (!isMapReady || !katasterMapModule) {
      return;
    }

    knotenSource?.clear();
    knotenSource?.addFeatures(katasterMapModule.createFeaturesFromRecords(knoten));
    pfostenSource?.clear();
    pfostenSource?.addFeatures(katasterMapModule.createFeaturesFromRecords(pfosten));
    wegweiserSource?.clear();
    wegweiserSource?.addFeatures(createWegweiserFeatures());
    kantenSource?.clear();
    kantenSource?.addFeatures(katasterMapModule.createFeaturesFromRecords(kanten));
    themenrouteSource?.clear();
    themenrouteSource?.addFeatures(katasterMapModule.createFeaturesFromRecords(themenrouten));
    verbindungSource?.clear();
    verbindungSource?.addFeatures(katasterMapModule.createFeaturesFromRecords(knotenpunktverbindungen));

    draftSource?.clear();
    const draftFeatures = createDraftPointFeatures(draftPoint);
    draftSource?.addFeatures(draftFeatures);
    draftFeatureCollection?.clear();
    draftFeatures.forEach((feature) => draftFeatureCollection?.push(feature));

    edgeDraftSource?.clear();
    edgeDraftSource?.addFeatures(createEdgeDraftFeatures(edgeDraft));

    edgeVertexSource?.clear();
    edgeVertexSource?.addFeatures(createEdgeVertexFeatures(edgeDraft));

    const currentSelection = untrack(() => selectedFeatureInfo);
    if (currentSelection?.collection === 'pfosten' && currentSelection.id) {
      const selectedPfosten = pfosten.find((entry) => entry.id === currentSelection.id);
      if (selectedPfosten) {
        selectPfostenRecord(selectedPfosten);
      }
    } else if (currentSelection?.collection === 'wegweiser' && currentSelection.id) {
      const selectedWegweiser = getWegweiserById(currentSelection.id);
      if (selectedWegweiser) {
        selectWegweiserRecord(selectedWegweiser);
      }
    }
  }

  function syncTranslateInteraction() {
    if (!translateInteraction) {
      return;
    }

    const shouldEnable =
      (draftMode === 'create' || draftMode === 'edit' || draftMode === 'create-pfosten' || draftMode === 'edit-pfosten') &&
      Boolean(draftPoint);
    translateInteraction.setActive(shouldEnable);
  }

  function syncEdgeModifyInteraction() {
    if (!edgeModifyInteraction) {
      return;
    }

    edgeModifyInteraction.setActive(
      (draftMode === 'create-edge' || draftMode === 'edit-edge') && Boolean(edgeDraft)
    );
  }

  function syncDragPanInteraction() {
    if (!dragPanInteraction) {
      return;
    }

    dragPanInteraction.setActive(true);
  }

  function focusPfostenOnMap(pfostenId: string) {
    if (!mapInstance || !pfostenId) {
      return;
    }

    const selectedPfosten = pfosten.find((entry) => entry.id === pfostenId);

    if (!selectedPfosten || selectedPfosten.lon === null || selectedPfosten.lat === null) {
      return;
    }

    mapInstance.getView().animate({
      center: fromLonLat([selectedPfosten.lon, selectedPfosten.lat]),
      zoom: 18,
      duration: 0
    });
  }

  function getWegweiserCenterById(wegweiserId: string): [number, number] | null {
    const current = getWegweiserById(wegweiserId);
    return current ? getWegweiserPfostenPosition(current) : null;
  }

  function getWegweiserAnchorPixelById(wegweiserId: string): [number, number] | null {
    if (!mapInstance) {
      return null;
    }

    const center = getWegweiserCenterById(wegweiserId);

    if (!center) {
      return null;
    }

    const anchor = mapInstance.getPixelFromCoordinate(center);
    return Array.isArray(anchor) ? ([anchor[0], anchor[1]] as [number, number]) : null;
  }

  function getWegweiserVectors(grad: number): { dirX: number; dirY: number; perpX: number; perpY: number } {
    const rotation = (grad * Math.PI) / 180;
    return {
      dirX: Math.sin(rotation),
      dirY: -Math.cos(rotation),
      perpX: Math.cos(rotation),
      perpY: Math.sin(rotation)
    };
  }

  function getWegweiserEffectivePlacement(wegweiserId: string): {
    distancePx: number;
    sideOffsetPx: number;
    grad: number;
  } | null {
    const feature = getWegweiserFeatureById(wegweiserId);

    if (!feature) {
      return null;
    }

    const storedDistance = typeof feature.get('darstellungsAbstand') === 'number' ? feature.get('darstellungsAbstand') : null;
    const storedSideOffset = typeof feature.get('seitlicherVersatz') === 'number' ? feature.get('seitlicherVersatz') : null;
    const grad = typeof feature.get('himmelsrichtungGrad') === 'number' ? feature.get('himmelsrichtungGrad') : 0;

    return {
      distancePx: storedDistance !== null ? Math.max(Math.trunc(storedDistance), wegweiserMinimumDistancePx) : wegweiserMinimumDistancePx,
      sideOffsetPx: storedSideOffset !== null ? Math.trunc(storedSideOffset) : 0,
      grad
    };
  }

  function getWegweiserBodyCenterPixel(
    anchorPixel: [number, number],
    placement: { distancePx: number; sideOffsetPx: number; grad: number }
  ): [number, number] {
    const { dirX, dirY, perpX, perpY } = getWegweiserVectors(placement.grad);
    const bodyHalfWidthPx = wegweiserBodyWidthPx / 2;
    const centerOffsetPx = placement.distancePx + bodyHalfWidthPx + wegweiserGapPx;

    return [
      anchorPixel[0] + centerOffsetPx * dirX + placement.sideOffsetPx * perpX,
      anchorPixel[1] + centerOffsetPx * dirY + placement.sideOffsetPx * perpY
    ];
  }

  function getWegweiserPlacementFromBodyCenter(
    anchorPixel: [number, number],
    bodyCenterPixel: [number, number],
    grad: number
  ): { distancePx: number; sideOffsetPx: number } {
    const { dirX, dirY, perpX, perpY } = getWegweiserVectors(grad);
    const vectorX = bodyCenterPixel[0] - anchorPixel[0];
    const vectorY = bodyCenterPixel[1] - anchorPixel[1];
    const projectedDistance =
      vectorX * dirX + vectorY * dirY - wegweiserBodyWidthPx / 2 - wegweiserGapPx;
    const projectedSideOffset = vectorX * perpX + vectorY * perpY;

    return {
      distancePx: Math.max(Math.trunc(projectedDistance), wegweiserMinimumDistancePx),
      sideOffsetPx: Math.trunc(projectedSideOffset)
    };
  }

  function syncWegweiserPlacementFeatureState(
    wegweiserId: string,
    distancePx: number,
    sideOffsetPx: number,
    manuellPositioniert = true
  ) {
    const feature = getWegweiserFeatureById(wegweiserId);

    if (!feature) {
      return;
    }

    feature.set('darstellungsAbstand', distancePx);
    feature.set('seitlicherVersatz', sideOffsetPx);
    feature.set('manuellPositioniert', manuellPositioniert);
    feature.changed();
    wegweiserSource?.changed();
    mapInstance?.render();
  }

  function updateRotatingWegweiser(point: [number, number]) {
    if (!rotatingWegweiserId || !rotatingWegweiserPfostenCenter) {
      return;
    }

    const [centerX, centerY] = rotatingWegweiserPfostenCenter;
    const [pointerX, pointerY] = point;
    const dx = pointerX - centerX;
    const dy = pointerY - centerY;
    const grad = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    rotatingWegweiserGrad = grad;
    const wegweiserRecord = getWegweiserById(rotatingWegweiserId);

    if (wegweiserRecord) {
      selectWegweiserRecord({
        ...wegweiserRecord,
        himmelsrichtungGrad: grad,
        himmelsrichtungText: gradZuHimmelsrichtung(grad)
      });
      syncWegweiserFeatureState(rotatingWegweiserId, grad);
    }
  }

  function beginWegweiserMove(wegweiserId: string, pointerPixel: [number, number]) {
    const placement = getWegweiserEffectivePlacement(wegweiserId);
    const anchorPixel = getWegweiserAnchorPixelById(wegweiserId);

    if (!placement || !anchorPixel) {
      return;
    }

    const bodyCenterPixel = getWegweiserBodyCenterPixel(anchorPixel, placement);
    movingWegweiserId = wegweiserId;
    movingWegweiserAnchorPixel = anchorPixel;
    movingWegweiserBodyOffset = [pointerPixel[0] - bodyCenterPixel[0], pointerPixel[1] - bodyCenterPixel[1]];
    movingWegweiserPointerDownPixel = pointerPixel;
    movingWegweiserOriginalDistance = placement.distancePx;
    movingWegweiserOriginalSideOffset = placement.sideOffsetPx;
    movingWegweiserOriginalManuellPositioniert = Boolean(getWegweiserFeatureById(wegweiserId)?.get('manuellPositioniert'));

    console.info('[KatasterMap] wegweiser move start', {
      id: wegweiserId,
      distance: placement.distancePx,
      sideOffset: placement.sideOffsetPx
    });
  }

  function updateMovingWegweiser(pointerPixel: [number, number]) {
    if (!movingWegweiserId || !movingWegweiserAnchorPixel || !movingWegweiserBodyOffset) {
      return;
    }

    const wegweiserRecord = getWegweiserById(movingWegweiserId);

    if (!wegweiserRecord) {
      return;
    }

    const bodyCenterPixel: [number, number] = [
      pointerPixel[0] - movingWegweiserBodyOffset[0],
      pointerPixel[1] - movingWegweiserBodyOffset[1]
    ];
    const placement = getWegweiserPlacementFromBodyCenter(
      movingWegweiserAnchorPixel,
      bodyCenterPixel,
      wegweiserRecord.himmelsrichtungGrad ?? 0
    );

    console.info('[KatasterMap] wegweiser move preview', {
      id: movingWegweiserId,
      distance: placement.distancePx,
      sideOffset: placement.sideOffsetPx
    });

    syncWegweiserPlacementFeatureState(movingWegweiserId, placement.distancePx, placement.sideOffsetPx);
  }

  function stopWegweiserMove(commit = true) {
    if (!movingWegweiserId) {
      return;
    }

    const wegweiserId = movingWegweiserId;
    const originalDistance = movingWegweiserOriginalDistance;
    const originalSideOffset = movingWegweiserOriginalSideOffset;
    const originalManuellPositioniert = movingWegweiserOriginalManuellPositioniert;
    movingWegweiserId = '';
    movingWegweiserAnchorPixel = null;
    movingWegweiserBodyOffset = null;
    movingWegweiserPointerDownPixel = null;

    if (!commit) {
      syncWegweiserPlacementFeatureState(wegweiserId, originalDistance, originalSideOffset, originalManuellPositioniert);
      return;
    }

    const feature = getWegweiserFeatureById(wegweiserId);
    const distancePx = typeof feature?.get('darstellungsAbstand') === 'number' ? feature.get('darstellungsAbstand') : originalDistance;
    const sideOffsetPx = typeof feature?.get('seitlicherVersatz') === 'number' ? feature.get('seitlicherVersatz') : originalSideOffset;

    console.info('[KatasterMap] wegweiser move save', {
      id: wegweiserId,
      distance: distancePx,
      sideOffset: sideOffsetPx
    });

    onWegweiserPlacementChangeRequest?.(wegweiserId, Math.trunc(distancePx), Math.trunc(sideOffsetPx));
  }

  function stopWegweiserRotation(commit = true) {
    if (!rotatingWegweiserId) {
      return;
    }

    const wegweiserId = rotatingWegweiserId;
    const grad = commit ? rotatingWegweiserGrad : rotatingWegweiserOriginalGrad;
    rotatingWegweiserId = '';
    rotatingWegweiserPfostenCenter = null;

    if (!commit) {
      syncWegweiserFeatureState(wegweiserId, grad);
      const originalRecord = getWegweiserById(wegweiserId);

      if (originalRecord) {
        selectWegweiserRecord(originalRecord);
      }

      return;
    }

    onWegweiserOrientationChangeRequest(wegweiserId, grad);
  }

  function cancelWegweiserPointerCandidate() {
    movingWegweiserPointerCandidateId = '';
    movingWegweiserPointerDownPixel = null;
  }

  $effect(() => {
    draftMode;
    draftPoint;
    edgeDraft;
    knoten;
    pfosten;
    kanten;
    themenrouten;
    knotenpunktverbindungen;
    wegweiser;
    refreshSources();
    syncTranslateInteraction();
    syncEdgeModifyInteraction();
    syncDragPanInteraction();
    updateMapCursor();
  });

  $effect(() => {
    if (!focusPfostenId || draftMode !== 'none') {
      return;
    }

    const selectedPfosten = pfosten.find((entry) => entry.id === focusPfostenId);

    if (selectedPfosten) {
      selectPfostenRecord(selectedPfosten);
      focusPfostenOnMap(selectedPfosten.id);
    }
  });

  $effect(() => {
    if (draftMode !== 'none' || !focusPfostenId) {
      return;
    }

    focusPfostenOnMap(focusPfostenId);
  });

  $effect(() => {
    selectedFeatureInfo;
    wegweiserSource?.changed();
    mapInstance?.render();
  });

  $effect(() => {
    if (!rotatingWegweiserId) {
      return;
    }

    const center = getWegweiserCenterById(rotatingWegweiserId);

    if (center) {
      rotatingWegweiserPfostenCenter = center;
    }
  });

  onMount(() => {
    let disposed = false;

    const initializeMap = async () => {
      if (!mapElement || disposed) {
        return;
      }

      await tick();

      const [
        { default: MapCtor },
        { default: View },
        { default: TileLayer },
        { default: OSM },
        { default: VectorLayer },
        { default: VectorSource },
        { default: CollectionCtor },
        { default: Translate },
        { default: Modify },
        { defaults: defaultInteractions },
        { default: DragPan },
        { isEmpty: isEmptyExtent },
        katasterMap
      ] = await Promise.all([
        import('ol/Map'),
        import('ol/View'),
        import('ol/layer/Tile'),
        import('ol/source/OSM'),
        import('ol/layer/Vector'),
        import('ol/source/Vector'),
        import('ol/Collection'),
        import('ol/interaction/Translate'),
        import('ol/interaction/Modify'),
        import('ol/interaction/defaults'),
        import('ol/interaction/DragPan'),
        import('ol/extent'),
        import('$lib/kataster-map')
      ]);

      katasterMapModule = katasterMap;

      if (disposed || !mapElement) {
        return;
      }

      const map = new MapCtor({
        target: mapElement,
        interactions: defaultInteractions({
          dragPan: false,
          doubleClickZoom: false
        }),
        layers: [new TileLayer({ source: new OSM() })],
        view: new View({
          center: katasterMap.katasterFallbackCenter,
          zoom: katasterMap.katasterFallbackZoom
        })
      });

      mapInstance = map;
      map.updateSize();
      requestAnimationFrame(() => map.updateSize());

      const knotenFeatures = katasterMap.createFeaturesFromRecords(knoten);
      const pfostenFeatures = katasterMap.createFeaturesFromRecords(pfosten);
      const wegweiserFeatures = createWegweiserFeatures();
      const kantenFeatures = katasterMap.createFeaturesFromRecords(kanten);
      const themenrouteFeatures = katasterMap.createFeaturesFromRecords(themenrouten);
      const verbindungFeatures = katasterMap.createFeaturesFromRecords(knotenpunktverbindungen);
      const draftFeatures = createDraftPointFeatures(draftPoint);
      const edgeDraftFeatures = createEdgeDraftFeatures(edgeDraft);
      const edgeVertexFeatures = createEdgeVertexFeatures(edgeDraft);

      themenrouteSource = new VectorSource({ features: themenrouteFeatures });
      verbindungSource = new VectorSource({ features: verbindungFeatures });
      kantenSource = new VectorSource({ features: kantenFeatures });
      pfostenSource = new VectorSource({ features: pfostenFeatures });
      wegweiserSource = new VectorSource({ features: wegweiserFeatures });
      knotenSource = new VectorSource({ features: knotenFeatures });
      draftSource = new VectorSource({ features: draftFeatures });
      edgeDraftSource = new VectorSource({ features: edgeDraftFeatures });
      edgeVertexSource = new VectorSource({ features: edgeVertexFeatures });

      map.addLayer(
        new VectorLayer({
          source: themenrouteSource,
          style: (feature) => katasterMap.getThemenrouteStyle(feature as Feature<Geometry>)
        })
      );
      map.addLayer(
        new VectorLayer({
          source: verbindungSource,
          style: katasterMap.getKatasterStyle('knotenpunktverbindung')
        })
      );
      map.addLayer(
        new VectorLayer({
          source: kantenSource,
          style: katasterMap.getKatasterStyle('kanten')
        })
      );
      map.addLayer(
        new VectorLayer({
          source: knotenSource,
          style: katasterMap.getKatasterStyle('knoten')
        })
      );
      map.addLayer(
        new VectorLayer({
          source: pfostenSource,
          style: katasterMap.getKatasterStyle('pfosten')
        })
      );
      map.addLayer(
        new VectorLayer({
          source: wegweiserSource,
          style: (feature, resolution) =>
            katasterMap.getWegweiserStyle(
              feature as Feature<Geometry>,
              selectedFeatureInfo?.collection === 'wegweiser' && selectedFeatureInfo.id === feature.get('id'),
              resolution ?? 1
            )
        })
      );
      map.addLayer(
        new VectorLayer({
          source: edgeDraftSource,
          style: edgeDraftStyle
        })
      );
      map.addLayer(
        new VectorLayer({
          source: edgeVertexSource,
          style: (feature) => getEdgeVertexStyle(feature as Feature<Geometry>)
        })
      );
      map.addLayer(
        new VectorLayer({
          source: draftSource,
          style: draftPointStyle
        })
      );

      draftFeatureCollection = new CollectionCtor();
      translateInteraction = new Translate({
        features: draftFeatureCollection
      });
      translateInteraction.setActive(false);
      map.addInteraction(translateInteraction);

      edgeModifyInteraction = new Modify({
        source: edgeDraftSource,
        condition: (mapBrowserEvent) => {
          const originalEvent = mapBrowserEvent.originalEvent;

          return (
            (draftMode === 'create-edge' || draftMode === 'edit-edge') &&
            isMouseLikeEvent(originalEvent) &&
            !isPanPointerEvent(originalEvent) &&
            !isSpacePressed
          );
        }
      });
      edgeModifyInteraction.setActive(false);
      map.addInteraction(edgeModifyInteraction);

      dragPanInteraction = new DragPan({
        condition: (mapBrowserEvent) => {
          return isMouseLikeEvent(mapBrowserEvent.originalEvent) && isPanPointerEvent(mapBrowserEvent.originalEvent);
        }
      });
      map.addInteraction(dragPanInteraction);

      translateInteraction.on('translateend', (event: { features: { item(index: number): Feature<Geometry> | undefined } }) => {
        const movedFeature = event.features.item(0);
        const geometry = movedFeature?.getGeometry();

        if (!(geometry instanceof Point)) {
          return;
        }

        const originalCoordinate = geometry.getCoordinates();
        const [lon, lat] = toLonLat(originalCoordinate);
        onDraftPointChange({ lon, lat, originalCoordinate: [originalCoordinate[0], originalCoordinate[1]] });
      });

      edgeModifyInteraction.on('modifyend', (event: { features: { item(index: number): Feature<Geometry> | undefined } }) => {
        const modifiedFeature = event.features.item(0);
        const geometry = modifiedFeature?.getGeometry();

        if (!(geometry instanceof LineString) || !edgeDraft) {
          return;
        }

        const lineCoordinates = geometry.getCoordinates().map((coordinate) => {
          const [lon, lat] = toLonLat(coordinate);
          return { lon, lat };
        });

        if (lineCoordinates.length < 2) {
          return;
        }

        onEdgeGeometryChange(lineCoordinates);
      });

      if (focusPfostenId) {
        const selectedPfosten = pfosten.find((entry) => entry.id === focusPfostenId);

        if (selectedPfosten) {
          selectPfostenRecord(selectedPfosten);
          focusPfostenOnMap(selectedPfosten.id);
        }
      } else {
        const allFeatures = [
          ...knotenFeatures,
          ...pfostenFeatures,
          ...kantenFeatures,
          ...themenrouteFeatures,
          ...verbindungFeatures
        ];

        if (allFeatures.length) {
          const extent = katasterMap.getFeaturesExtent(allFeatures);

          if (!isEmptyExtent(extent)) {
            map.getView().fit(extent, {
              padding: [48, 48, 48, 48],
              maxZoom: 17,
              duration: 0
            });
          }
        }
      }

      map.on('pointermove', (event) => {
        const originalEvent = event.originalEvent;
        const isRotationGesture =
          isMouseLikeEvent(originalEvent) &&
          originalEvent.ctrlKey &&
          originalEvent.buttons === 1;

        if (movingWegweiserId) {
          updateMovingWegweiser(event.pixel as [number, number]);
          return;
        }

        if (
          movingWegweiserPointerCandidateId &&
          movingWegweiserPointerDownPixel &&
          isMouseLikeEvent(originalEvent) &&
          originalEvent.buttons === 1 &&
          !isRotationGesture
        ) {
          const deltaX = event.pixel[0] - movingWegweiserPointerDownPixel[0];
          const deltaY = event.pixel[1] - movingWegweiserPointerDownPixel[1];
          const dragDistance = Math.hypot(deltaX, deltaY);

          if (dragDistance >= 4) {
            beginWegweiserMove(movingWegweiserPointerCandidateId, event.pixel as [number, number]);
            updateMovingWegweiser(event.pixel as [number, number]);
            return;
          }
        }

        if (isRotationGesture && !rotatingWegweiserId) {
          const hoveredFeature = map.forEachFeatureAtPixel(event.pixel, (candidate) => {
            return candidate instanceof Feature ? (candidate as Feature<Geometry>) : null;
          });

          if (hoveredFeature && hoveredFeature.get('collection') === 'wegweiser') {
            const featureId = hoveredFeature.get('id') ?? hoveredFeature.getId();

            if (typeof featureId === 'string') {
              const selectedWegweiser = getWegweiserById(featureId);

              if (selectedWegweiser) {
                rotatingWegweiserId = featureId;
                rotatingWegweiserPfostenCenter = getWegweiserPfostenPosition(selectedWegweiser);
                rotatingWegweiserGrad = selectedWegweiser.himmelsrichtungGrad ?? 0;
                rotatingWegweiserOriginalGrad = rotatingWegweiserGrad;
                selectWegweiserRecord(selectedWegweiser);
              }
            }
          }
        }

        if (rotatingWegweiserId) {
          updateRotatingWegweiser(event.coordinate as [number, number]);
          return;
        }

        if (draftMode !== 'create-edge' || !edgeDraft || edgeDraft.endPoint) {
          return;
        }

        if (isMouseLikeEvent(event.originalEvent) && isPanPointerEvent(event.originalEvent)) {
          return;
        }

        const [lon, lat] = toLonLat(event.coordinate);
        onEdgeHoverChange({ lon, lat });
      });

      map.on('pointerdown' as never, (event: any) => {
        const originalEvent = event.originalEvent;

        if (
          draftMode !== 'none' ||
          rotatingWegweiserId ||
          movingWegweiserId ||
          !isMouseLikeEvent(originalEvent) ||
          originalEvent.button !== 0 ||
          originalEvent.ctrlKey ||
          isPanPointerEvent(originalEvent)
        ) {
          return;
        }

        const hoveredFeature = map.forEachFeatureAtPixel(event.pixel, (candidate) => {
          return candidate instanceof Feature ? (candidate as Feature<Geometry>) : null;
        });

        if (!hoveredFeature || hoveredFeature.get('collection') !== 'wegweiser') {
          cancelWegweiserPointerCandidate();
          return;
        }

        const featureId = hoveredFeature.get('id') ?? hoveredFeature.getId();

        if (typeof featureId !== 'string' || !featureId) {
          return;
        }

        const selectedWegweiser = getWegweiserById(featureId);

        if (!selectedWegweiser) {
          return;
        }

        selectWegweiserRecord(selectedWegweiser);
        movingWegweiserPointerCandidateId = featureId;
        movingWegweiserPointerDownPixel = [event.pixel[0], event.pixel[1]];
        updateMapCursor();
      });

      map.on('singleclick', (event) => {
        const originalEvent = event.originalEvent;

        if (isMouseLikeEvent(originalEvent) && isPanPointerEvent(originalEvent)) {
          return;
        }

        if (isSpacePressed) {
          return;
        }

        const feature = map.forEachFeatureAtPixel(event.pixel, (candidate) => {
          return candidate instanceof Feature ? (candidate as Feature<Geometry>) : null;
        });

        if (draftMode === 'create-edge') {
          const clickedKnoten = map.forEachFeatureAtPixel(event.pixel, (candidate) => {
            if (!(candidate instanceof Feature)) {
              return null;
            }

            return candidate.get('collection') === 'knoten' ? (candidate as Feature<Geometry>) : null;
          });

          if (clickedKnoten) {
            const featureId = clickedKnoten.get('id') ?? clickedKnoten.getId();

            if (typeof featureId === 'string' && featureId) {
              selectedFeatureInfo = getSelectedFeatureInfo(clickedKnoten);
              onEdgeNodeSelect(featureId);
            }
            return;
          }

          if (edgeDraft?.endPoint) {
            onEdgeVertexSelect(null);
          }
          return;
        }

        if (draftMode === 'edit-edge') {
          const clickedVertex = map.forEachFeatureAtPixel(event.pixel, (candidate) => {
            if (!(candidate instanceof Feature)) {
              return null;
            }

            return typeof candidate.get('vertexIndex') === 'number' ? (candidate as Feature<Geometry>) : null;
          });

          if (clickedVertex) {
            const vertexIndex = clickedVertex.get('vertexIndex');
            onEdgeVertexSelect(typeof vertexIndex === 'number' ? vertexIndex : null);
            return;
          }

          const clickedKante = map.forEachFeatureAtPixel(event.pixel, (candidate) => {
            if (!(candidate instanceof Feature)) {
              return null;
            }

            return candidate.get('collection') === 'kanten' ? (candidate as Feature<Geometry>) : null;
          });

          if (clickedKante) {
            const featureId = clickedKante.get('id') ?? clickedKante.getId();

          if (typeof featureId === 'string' && featureId) {
              selectedFeatureInfo = getSelectedFeatureInfo(clickedKante);
              onEdgeFeatureSelect(featureId);
            }
            return;
          }

          onEdgeVertexSelect(null);
          return;
        }

        if (draftMode !== 'none') {
          const [lon, lat] = toLonLat(event.coordinate);
          selectedFeatureInfo = null;
          onDraftPointChange({ lon, lat, originalCoordinate: [event.coordinate[0], event.coordinate[1]] });
          return;
        }

        if (!feature) {
          selectedFeatureInfo = null;
          return;
        }

        if (feature.get('collection') === 'wegweiser') {
          const featureId = feature.get('id') ?? feature.getId();

          if (typeof featureId === 'string') {
            const selectedWegweiser = getWegweiserById(featureId);

            if (selectedWegweiser) {
              selectWegweiserRecord(selectedWegweiser);
            }
          }
          return;
        }

        selectedFeatureInfo = getSelectedFeatureInfo(feature);

        if (feature.get('collection') === 'kanten') {
          const featureId = feature.get('id') ?? feature.getId();

          if (typeof featureId === 'string' && featureId) {
            onEdgeFeatureSelect(featureId);
          }
        }
      });

      map.on('dblclick', (event) => {
        const originalEvent = event.originalEvent;

        if (isMouseLikeEvent(originalEvent) && isPanPointerEvent(originalEvent)) {
          return;
        }

        if (isSpacePressed || draftMode !== 'edit-edge') {
          return;
        }

        const clickedEndpointVertex = map.forEachFeatureAtPixel(
          event.pixel,
          (candidate) => {
            if (!(candidate instanceof Feature)) {
              return null;
            }

            const vertexIndex = candidate.get('vertexIndex');

            if (typeof vertexIndex !== 'number' || !edgeDraft) {
              return null;
            }

            return vertexIndex === 0 || vertexIndex === edgeDraft.coordinates.length - 1
              ? (candidate as Feature<Geometry>)
              : null;
          },
          {
            hitTolerance: 12
          }
        );

        if (!clickedEndpointVertex) {
          return;
        }

        originalEvent.preventDefault();
        onEdgeEditSaveRequest();
      });

      isMapReady = true;
      syncTranslateInteraction();
      syncEdgeModifyInteraction();
      syncDragPanInteraction();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        if (event.code === 'Escape') {
          cancelWegweiserPointerCandidate();
          stopWegweiserMove(false);
          stopWegweiserRotation(false);
          isPanDragging = false;
          updateMapCursor();
        }
        return;
      }

      isSpacePressed = true;
      updateMapCursor();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }

      isSpacePressed = false;
      isPanDragging = false;
      updateMapCursor();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!mapElement?.contains(event.target as Node)) {
        return;
      }

      if (isPanPointerEvent(event)) {
        isPanDragging = true;
        updateMapCursor();
      }
    };

    const handlePointerUp = () => {
      if (movingWegweiserId) {
        stopWegweiserMove(true);
      }

      cancelWegweiserPointerCandidate();

      if (!movingWegweiserId) {
        stopWegweiserRotation(true);
      }

      isPanDragging = false;
      updateMapCursor();
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (mapElement?.contains(event.target as Node)) {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('contextmenu', handleContextMenu);

    void initializeMap();

    return () => {
      disposed = true;
      isMapReady = false;
      isSpacePressed = false;
      isPanDragging = false;
      updateMapCursor();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('contextmenu', handleContextMenu);
      mapInstance?.setTarget(undefined);
    };
  });
</script>

<div class="kataster-map-shell">
  <div class="kataster-map-frame" class:kataster-map-frame-creating={draftMode !== 'none'}>
    {#if draftMode === 'create'}
      <div class="kataster-map-mode-banner">Bearbeitungsmodus aktiv: Knoten per Klick in die Karte setzen</div>
    {:else if draftMode === 'create-pfosten'}
      <div class="kataster-map-mode-banner">Bitte Position des Pfostens in der Karte anklicken.</div>
    {:else if draftMode === 'edit-pfosten'}
      <div class="kataster-map-mode-banner">Bearbeitungsmodus aktiv: Pfostenposition per Klick oder Drag verschieben</div>
    {:else if draftMode === 'edit'}
      <div class="kataster-map-mode-banner">Bearbeitungsmodus aktiv: Knotenposition per Klick oder Drag verschieben</div>
    {:else if draftMode === 'create-edge'}
      <div class="kataster-map-mode-banner">Bearbeitungsmodus aktiv: Start, Ziel und Linienverlauf fuer neue Kante setzen</div>
    {:else if draftMode === 'edit-edge'}
      <div class="kataster-map-mode-banner">Bearbeitungsmodus aktiv: Kante als Polylinie bearbeiten</div>
    {/if}
    <div bind:this={mapElement} class="kataster-map" aria-label="Katasterkarte"></div>
  </div>

  <aside class="kataster-info-panel">
    <h2>Karteninfo</h2>
    {#if draftMode === 'create'}
      <p>
        {#if draftPoint}
          Punkt gesetzt. Formular ausfuellen oder mit einem weiteren Kartenklick verschieben.
        {:else}
          Klicke in die Karte, um einen neuen Knoten zu platzieren.
        {/if}
      </p>
    {:else if draftMode === 'edit'}
      <p>
        {#if draftPoint}
          Bearbeitungsentwurf aktiv. Position per Kartenklick oder Ziehen des Punktes anpassen.
        {:else}
          Bearbeitungsmodus aktiv.
        {/if}
      </p>
    {:else if draftMode === 'create-pfosten'}
      <p>
        {#if draftPoint}
          Pfostenposition gesetzt. Pfostendaten ausfuellen und speichern.
        {:else}
          Bitte Position des Pfostens in der Karte anklicken.
        {/if}
      </p>
    {:else if draftMode === 'edit-pfosten'}
      <p>Pfosten bearbeiten. Position per Kartenklick oder Ziehen des Punktes anpassen.</p>
    {:else if draftMode === 'create-edge'}
      <p>
        {#if edgeDraft}
          {#if edgeDraft.endPoint}
            Zielknoten gesetzt. Linie oder Segment direkt ziehen, um den Verlauf zu formen.
          {:else}
            Startknoten gesetzt. Eine Entwurfslinie folgt der Maus, bis der Zielknoten angeklickt wird.
          {/if}
        {:else}
          Klicke einen bestehenden Knoten als Startknoten an.
        {/if}
      </p>
    {:else if draftMode === 'edit-edge'}
      <p>Kante aktiv. Linie oder vorhandene Stuetzpunkte direkt ziehen, um den Verlauf zu formen.</p>
    {:else if selectedFeatureInfo}
      <dl class="kataster-info-list">
        <div>
          <dt>Typ</dt>
          <dd>{selectedFeatureInfo.collection}</dd>
        </div>
        <div>
          <dt>Name / Nummer</dt>
          <dd>{selectedFeatureInfo.title}</dd>
        </div>
        {#if selectedFeatureInfo.subtitle}
          <div>
            <dt>Zusatz</dt>
            <dd>{selectedFeatureInfo.subtitle}</dd>
          </div>
        {/if}
        <div>
          <dt>Status</dt>
          <dd>{selectedFeatureInfo.status || 'ohne Status'}</dd>
        </div>
        {#each selectedFeatureInfo.details ?? [] as detail}
          <div>
            <dt>{detail.label}</dt>
            <dd>{detail.value}</dd>
          </div>
        {/each}
      </dl>
      {#if selectedFeatureInfo.collection === 'wegweiser'}
        <p>STRG gedrueckt halten und ziehen, um die Richtung zu aendern.</p>
      {/if}
      {#if selectedFeatureInfo.relatedPfosten?.length}
        <h3>Zugehoerige Pfosten</h3>
        <ul class="kataster-related-list">
          {#each selectedFeatureInfo.relatedPfosten as pfostenInfo}
            <li>
              <strong>{pfostenInfo.title}</strong>
              {#if pfostenInfo.subtitle}
                <span>{pfostenInfo.subtitle}</span>
              {/if}
              {#if pfostenInfo.status}
                <small>{pfostenInfo.status}</small>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if selectedFeatureInfo.collection === 'pfosten'}
        <h3>Zugeordnete Wegweiser</h3>
        {#if selectedFeatureInfo.relatedWegweiser?.length}
          <ul class="kataster-related-list">
            {#each selectedFeatureInfo.relatedWegweiser as wegweiserInfo}
              <li>
                <strong>{wegweiserNumberLine(wegweiserInfo)}</strong>
                <small>{wegweiserStatusLine(wegweiserInfo.status)}</small>
                {#if wegweiserInfo.title}
                  <span>{wegweiserInfo.title}</span>
                {/if}
                {#if wegweiserInfo.wegweiser_typ}
                  <small>Typ: {wegweiserInfo.wegweiser_typ}</small>
                {/if}
                {#if wegweiserInfo.richtung}
                  <small>Richtung: {wegweiserInfo.richtung}</small>
                {/if}
                {#if wegweiserInfo.ziele.length}
                  <small>Ziele: {wegweiserInfo.ziele.join(' / ')}</small>
                {/if}
                <button
                  class="button secondary-button button-small"
                  type="button"
                  onclick={() =>
                    selectedFeatureInfo?.id && onWegweiserEditRequest(wegweiserInfo.id, selectedFeatureInfo.id)}
                >
                  Bearbeiten
                </button>
                <button
                  class="button secondary-button button-small"
                  type="button"
                  onclick={() =>
                    selectedFeatureInfo?.id && onWegweiserUnlinkRequest(wegweiserInfo.id, selectedFeatureInfo.id)}
                >
                  Zuordnung entfernen
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p>Keine Wegweiser zugeordnet.</p>
        {/if}
      {/if}
      {#if canEdit && selectedFeatureInfo.collection === 'knoten'}
        <button
          class="button secondary-button button-small"
          type="button"
          onclick={() => selectedFeatureInfo?.id && onEditKnotenSelect(selectedFeatureInfo.id)}
        >
          Knoten bearbeiten
        </button>
        <button
          class="button secondary-button button-small"
          type="button"
          onclick={() => selectedFeatureInfo?.id && onPfostenCreateRequest(selectedFeatureInfo.id)}
        >
          Pfosten hinzufuegen
        </button>
      {/if}
      {#if canEdit && selectedFeatureInfo.collection === 'pfosten'}
        <button
          class="button secondary-button button-small"
          type="button"
          onclick={() => selectedFeatureInfo?.id && onWegweiserAddRequest(selectedFeatureInfo.id)}
        >
          Wegweiser hinzufuegen
        </button>
        <button
          class="button secondary-button button-small"
          type="button"
          onclick={() => selectedFeatureInfo?.id && onPfostenEditRequest(selectedFeatureInfo.id)}
        >
          Pfosten bearbeiten
        </button>
      {/if}
    {:else}
      <p>Einen Knoten, Pfosten oder eine Kante anklicken, um Details anzuzeigen.</p>
    {/if}
  </aside>
</div>

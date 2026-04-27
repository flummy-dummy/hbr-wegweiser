<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { KatasterFeatureInfo, KatasterMapRecord } from '$lib/kataster';
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

  type DraftPoint = {
    lon: number;
    lat: number;
  };

  type DraftMode = 'none' | 'create' | 'edit' | 'create-edge' | 'edit-edge';

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
    draftMode = 'none',
    draftPoint = null,
    edgeDraft = null,
    onDraftPointChange = (_point: DraftPoint | null) => {},
    onEditKnotenSelect = (_knotenId: string) => {},
    onEdgeNodeSelect = (_knotenId: string) => {},
    onEdgeHoverChange = (_point: DraftPoint | null) => {},
    onEdgeFeatureSelect = (_kanteId: string) => {},
    onEdgeVertexSelect = (_index: number | null) => {},
    onEdgeGeometryChange = (_points: DraftPoint[]) => {},
    onEdgeEditSaveRequest = () => {}
  }: {
    knoten: KatasterMapRecord[];
    pfosten: KatasterMapRecord[];
    kanten: KatasterMapRecord[];
    themenrouten: KatasterMapRecord[];
    knotenpunktverbindungen: KatasterMapRecord[];
    draftMode?: DraftMode;
    draftPoint?: DraftPoint | null;
    edgeDraft?: EdgeDraft | null;
    onDraftPointChange?: (point: DraftPoint | null) => void;
    onEditKnotenSelect?: (knotenId: string) => void;
    onEdgeNodeSelect?: (knotenId: string) => void;
    onEdgeHoverChange?: (point: DraftPoint | null) => void;
    onEdgeFeatureSelect?: (kanteId: string) => void;
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

    mapElement.style.cursor = isPanDragging ? 'grabbing' : isSpacePressed ? 'grab' : '';
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

  function refreshSources() {
    if (!isMapReady || !katasterMapModule) {
      return;
    }

    knotenSource?.clear();
    knotenSource?.addFeatures(katasterMapModule.createFeaturesFromRecords(knoten));
    pfostenSource?.clear();
    pfostenSource?.addFeatures(katasterMapModule.createFeaturesFromRecords(pfosten));
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
  }

  function syncTranslateInteraction() {
    if (!translateInteraction) {
      return;
    }

    const shouldEnable = (draftMode === 'create' || draftMode === 'edit') && Boolean(draftPoint);
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

  $effect(() => {
    draftMode;
    draftPoint;
    edgeDraft;
    knoten;
    pfosten;
    kanten;
    themenrouten;
    knotenpunktverbindungen;
    refreshSources();
    syncTranslateInteraction();
    syncEdgeModifyInteraction();
    syncDragPanInteraction();
    updateMapCursor();
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
          source: pfostenSource,
          style: katasterMap.getKatasterStyle('pfosten')
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

        const [lon, lat] = toLonLat(geometry.getCoordinates());
        onDraftPointChange({ lon, lat });
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

      map.on('pointermove', (event) => {
        if (draftMode !== 'create-edge' || !edgeDraft || edgeDraft.endPoint) {
          return;
        }

        if (isMouseLikeEvent(event.originalEvent) && isPanPointerEvent(event.originalEvent)) {
          return;
        }

        const [lon, lat] = toLonLat(event.coordinate);
        onEdgeHoverChange({ lon, lat });
      });

      map.on('singleclick', (event) => {
        const originalEvent = event.originalEvent;

        if (originalEvent instanceof MouseEvent && isPanPointerEvent(originalEvent)) {
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
              selectedFeatureInfo = katasterMap.getFeatureInfo(clickedKnoten);
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
              selectedFeatureInfo = katasterMap.getFeatureInfo(clickedKante);
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
          onDraftPointChange({ lon, lat });
          return;
        }

        if (!feature) {
          selectedFeatureInfo = null;
          return;
        }

        selectedFeatureInfo = katasterMap.getFeatureInfo(feature);

        if (feature.get('collection') === 'knoten') {
          const featureId = feature.get('id') ?? feature.getId();

          if (typeof featureId === 'string' && featureId) {
            onEditKnotenSelect(featureId);
          }
        } else if (feature.get('collection') === 'kanten') {
          const featureId = feature.get('id') ?? feature.getId();

          if (typeof featureId === 'string' && featureId) {
            onEdgeFeatureSelect(featureId);
          }
        }
      });

      map.on('dblclick', (event) => {
        const originalEvent = event.originalEvent;

        if (originalEvent instanceof MouseEvent && isPanPointerEvent(originalEvent)) {
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
      </dl>
    {:else}
      <p>Einen Knoten oder eine Kante anklicken, um die Geometrie zu bearbeiten.</p>
    {/if}
  </aside>
</div>

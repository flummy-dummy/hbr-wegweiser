<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { KatasterFeatureInfo, KatasterMapRecord } from '$lib/kataster';
  import Feature from 'ol/Feature';
  import type Geometry from 'ol/geom/Geometry';
  import 'ol/ol.css';

  let {
    knoten = [],
    pfosten = [],
    kanten = [],
    themenrouten = [],
    knotenpunktverbindungen = []
  }: {
    knoten: KatasterMapRecord[];
    pfosten: KatasterMapRecord[];
    kanten: KatasterMapRecord[];
    themenrouten: KatasterMapRecord[];
    knotenpunktverbindungen: KatasterMapRecord[];
  } = $props();

  let mapElement = $state<HTMLDivElement | null>(null);
  let selectedFeatureInfo = $state<KatasterFeatureInfo | null>(null);

  onMount(() => {
    console.log('[KatasterMap] Komponente gemountet');
    let disposed = false;
    let mapInstance: { setTarget(target: HTMLElement | undefined): void } | null = null;

    const initializeMap = async () => {
      console.log('[KatasterMap] Initialisierung gestartet');

      if (!mapElement || disposed) {
        console.error('[KatasterMap] Target-Element fehlt oder Komponente ist bereits disposed', {
          hasMapElement: Boolean(mapElement),
          disposed
        });
        return;
      }

      await tick();

      console.log('[KatasterMap] Target-Element vorhanden', {
        width: mapElement.clientWidth,
        height: mapElement.clientHeight
      });

      const [
        { default: Map },
        { default: View },
        { default: TileLayer },
        { default: OSM },
        { default: VectorLayer },
        { default: VectorSource },
        { isEmpty: isEmptyExtent },
        katasterMap
      ] = await Promise.all([
        import('ol/Map'),
        import('ol/View'),
        import('ol/layer/Tile'),
        import('ol/source/OSM'),
        import('ol/layer/Vector'),
        import('ol/source/Vector'),
        import('ol/extent'),
        import('$lib/kataster-map')
      ]);

      console.log('[KatasterMap] OpenLayers-Imports erfolgreich');

      if (disposed || !mapElement) {
        console.error('[KatasterMap] Initialisierung nach Imports abgebrochen', {
          hasMapElement: Boolean(mapElement),
          disposed
        });
        return;
      }

      const osmSource = new OSM();
      console.log('[KatasterMap] OSM source erstellt');

      const baseLayer = new TileLayer({ source: osmSource });
      console.log('[KatasterMap] TileLayer erstellt');

      const view = new View({
        center: katasterMap.katasterFallbackCenter,
        zoom: katasterMap.katasterFallbackZoom
      });
      console.log('[KatasterMap] View erstellt');

      try {
        const map = new Map({
          target: mapElement,
          layers: [baseLayer],
          view
        });

        console.log('[KatasterMap] Map erstellt');

        mapInstance = map;
        map.updateSize();
        requestAnimationFrame(() => {
          map.updateSize();
          console.log('[KatasterMap] map.updateSize() ausgeführt');
        });

        const knotenFeatures = katasterMap.createFeaturesFromRecords(knoten);
        const pfostenFeatures = katasterMap.createFeaturesFromRecords(pfosten);
        const kantenFeatures = katasterMap.createFeaturesFromRecords(kanten);
        const themenrouteFeatures = katasterMap.createFeaturesFromRecords(themenrouten);
        const verbindungFeatures = katasterMap.createFeaturesFromRecords(knotenpunktverbindungen);

        console.log('[KatasterMap] Datenlayer vorbereitet', {
          knoten: knotenFeatures.length,
          pfosten: pfostenFeatures.length,
          kanten: kantenFeatures.length,
          themenrouten: themenrouteFeatures.length,
          knotenpunktverbindungen: verbindungFeatures.length
        });

        const themenrouteLayer = new VectorLayer({
          source: new VectorSource({ features: themenrouteFeatures }),
          style: (feature) => katasterMap.getThemenrouteStyle(feature as Feature<Geometry>)
        });
        const verbindungLayer = new VectorLayer({
          source: new VectorSource({ features: verbindungFeatures }),
          style: katasterMap.getKatasterStyle('knotenpunktverbindung')
        });
        const kantenLayer = new VectorLayer({
          source: new VectorSource({ features: kantenFeatures }),
          style: katasterMap.getKatasterStyle('kanten')
        });
        const pfostenLayer = new VectorLayer({
          source: new VectorSource({ features: pfostenFeatures }),
          style: katasterMap.getKatasterStyle('pfosten')
        });
        const knotenLayer = new VectorLayer({
          source: new VectorSource({ features: knotenFeatures }),
          style: katasterMap.getKatasterStyle('knoten')
        });

        map.addLayer(themenrouteLayer);
        map.addLayer(verbindungLayer);
        map.addLayer(kantenLayer);
        map.addLayer(pfostenLayer);
        map.addLayer(knotenLayer);
        console.log('[KatasterMap] Vektorlayer hinzugefügt');

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
            console.log('[KatasterMap] Auf Datenextent gezoomt');
          }
        }

        map.on('singleclick', (event) => {
          const feature = map.forEachFeatureAtPixel(event.pixel, (candidate) => {
            return candidate instanceof Feature ? (candidate as Feature<Geometry>) : null;
          });

          if (!feature) {
            selectedFeatureInfo = null;
            return;
          }

          selectedFeatureInfo = katasterMap.getFeatureInfo(feature);
        });
      } catch (error) {
        console.error('[KatasterMap] OpenLayers-Initialisierung fehlgeschlagen', error);
      }
    };

    void initializeMap();

    return () => {
      disposed = true;
      mapInstance?.setTarget(undefined);
    };
  });
</script>

<div class="kataster-map-shell">
  <div class="kataster-map-frame">
    <div bind:this={mapElement} class="kataster-map" aria-label="Katasterkarte"></div>
  </div>

  <aside class="kataster-info-panel">
    <h2>Karteninfo</h2>
    {#if selectedFeatureInfo}
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
      <p>Ein Punkt oder eine Linie anklicken, um Details zu sehen.</p>
    {/if}
  </aside>
</div>

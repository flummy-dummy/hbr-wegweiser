import type { GeoJsonGeometry, KatasterFeatureInfo, KatasterMapRecord } from '$lib/kataster';
import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import type Geometry from 'ol/geom/Geometry';
import Point from 'ol/geom/Point';
import { boundingExtent } from 'ol/extent';
import { fromLonLat } from 'ol/proj';
import { Circle as CircleStyle, Fill, RegularShape, Stroke, Style } from 'ol/style';

const geoJsonFormat = new GeoJSON({
  dataProjection: 'EPSG:4326',
  featureProjection: 'EPSG:3857'
});

export const katasterFallbackCenter = fromLonLat([7.357, 52.144]);
export const katasterFallbackZoom = 10;

export function createGeometryFromRecord(record: KatasterMapRecord): Geometry | null {
  if (record.geomJson) {
    const feature = geoJsonFormat.readFeature({
      type: 'Feature',
      geometry: record.geomJson as GeoJsonGeometry,
      properties: {}
    }) as Feature<Geometry>;

    return feature.getGeometry() ?? null;
  }

  if (
    (record.collection === 'knoten' || record.collection === 'pfosten') &&
    record.lon !== null &&
    record.lat !== null
  ) {
    return new Point(fromLonLat([record.lon, record.lat]));
  }

  return null;
}

export function createFeaturesFromRecords(records: KatasterMapRecord[]): Feature<Geometry>[] {
  return records
    .map((record) => {
      const geometry = createGeometryFromRecord(record);

      if (!geometry) {
        return null;
      }

      const feature = new Feature({ geometry });
      feature.setId(record.id);
      feature.setProperties({
        id: record.id,
        collection: record.collection,
        title: record.title,
        subtitle: record.subtitle ?? '',
        status: record.status ?? '',
        groupKey: record.groupKey ?? '',
        color: record.color ?? '',
        formData: record.formData ?? {}
      });
      return feature;
    })
    .filter((feature): feature is Feature<Geometry> => feature !== null);
}

export function getFeaturesExtent(features: Feature<Geometry>[]) {
  return boundingExtent(
    features.flatMap((feature) => {
      const geometry = feature.getGeometry();
      return geometry ? [geometry.getExtent()] : [];
    })
  );
}

export function getKatasterStyle(collection: KatasterMapRecord['collection']): Style {
  if (collection === 'knoten') {
    return new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: '#d7001f' }),
        stroke: new Stroke({ color: '#ffffff', width: 2 })
      }),
      zIndex: 20
    });
  }

  if (collection === 'pfosten') {
    return new Style({
      image: new RegularShape({
        points: 4,
        radius: 7,
        angle: Math.PI / 4,
        fill: new Fill({ color: '#2457a6' }),
        stroke: new Stroke({ color: '#ffffff', width: 2 })
      }),
      zIndex: 30
    });
  }

  if (collection === 'knotenpunktverbindung') {
    return new Style({
      stroke: new Stroke({
        color: '#7c3aed',
        width: 4,
        lineDash: [10, 8]
      })
    });
  }

  if (collection === 'themenroute') {
    return new Style({
      stroke: new Stroke({
        color: '#f59e0b',
        width: 5
      })
    });
  }

  return new Style({
    stroke: new Stroke({
      color: '#2f7d32',
      width: 3
    })
  });
}

export function getThemenrouteStyle(feature: Feature<Geometry>): Style {
  const color = feature.get('color');

  return new Style({
    stroke: new Stroke({
      color: typeof color === 'string' && color.trim() ? color : '#f59e0b',
      width: 5
    })
  });
}

export function getFeatureInfo(feature: Feature<Geometry>): KatasterFeatureInfo {
  const collection = feature.get('collection');
  const formData = feature.get('formData') as KatasterMapRecord['formData'] | undefined;
  const details: KatasterFeatureInfo['details'] = [];

  if (collection === 'knoten') {
    const entries = [
      ['Knotenkennung', formData?.knotenKennung],
      ['Knoten-Nr.', formData?.knotenNr],
      ['Kommune', formData?.kommune],
      ['Kreis', formData?.kreis],
      ['NRW-POI-Nr.', formData?.nrwPoiNr]
    ] as const;
    entries.forEach(([label, value]) => {
      if (value) {
        details.push({ label, value });
      }
    });
  }

  if (collection === 'pfosten') {
    const entries = [
      ['Pfostenkennung', formData?.pfostenKennung],
      ['Laufende Pfostennummer', formData?.pfostenIndex ? String(formData.pfostenIndex) : undefined],
      ['Pfosten-Nr.', formData?.pfostenNr],
      ['Typ', formData?.pfostenTyp],
      ['Material', formData?.pfostenMaterial],
      ['Foto-Kennung', formData?.pfostenFotoKennung],
      ['NRW-Rohwert', formData?.nrwRawValue],
      ['NRW-Object-ID', formData?.nrwObjectId]
    ] as const;
    entries.forEach(([label, value]) => {
      if (value) {
        details.push({ label, value });
      }
    });
  }

  return {
    id: feature.get('id') || String(feature.getId() ?? ''),
    collection,
    title: feature.get('title'),
    subtitle: feature.get('subtitle') || undefined,
    status: feature.get('status') || 'ohne Status',
    details
  };
}

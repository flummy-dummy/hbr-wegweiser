import type { GeoJsonGeometry, KatasterFeatureInfo, KatasterMapRecord } from '$lib/kataster';
import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import type Geometry from 'ol/geom/Geometry';
import Point from 'ol/geom/Point';
import { boundingExtent } from 'ol/extent';
import { fromLonLat } from 'ol/proj';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';

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
      feature.setProperties({
        collection: record.collection,
        title: record.title,
        subtitle: record.subtitle ?? '',
        status: record.status ?? '',
        groupKey: record.groupKey ?? '',
        color: record.color ?? ''
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
      })
    });
  }

  if (collection === 'pfosten') {
    return new Style({
      image: new CircleStyle({
        radius: 5,
        fill: new Fill({ color: '#2457a6' }),
        stroke: new Stroke({ color: '#ffffff', width: 2 })
      })
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
  return {
    collection: feature.get('collection'),
    title: feature.get('title'),
    subtitle: feature.get('subtitle') || undefined,
    status: feature.get('status') || 'ohne Status'
  };
}

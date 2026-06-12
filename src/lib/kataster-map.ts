import type { GeoJsonGeometry, KatasterFeatureInfo, KatasterMapRecord } from '$lib/kataster';
import Feature from 'ol/Feature';
import type { Coordinate } from 'ol/coordinate';
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
export const wegweiserBodyWidthPx = 120;
export const wegweiserBodyHeightPx = 36;
export const wegweiserTipLengthPx = 24;
export const wegweiserMinimumDistancePx = 60;
export const wegweiserAutomaticSideOffsetStepPx = 60;
export const wegweiserGapPx = 0;

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

export function getWegweiserStyle(feature: Feature<Geometry>, selected = false, _resolution = 1): Style | Style[] {
  const grad = typeof feature.get('himmelsrichtungGrad') === 'number' ? feature.get('himmelsrichtungGrad') : 0;
  const rotation = (grad * Math.PI) / 180;
  const bodyWidthPx = wegweiserBodyWidthPx;
  const bodyHeightPx = wegweiserBodyHeightPx;
  const tipLengthPx = wegweiserTipLengthPx;
  const gapPx = wegweiserGapPx;
  const distancePx =
    typeof feature.get('darstellungsAbstand') === 'number'
      ? Math.max(feature.get('darstellungsAbstand'), wegweiserMinimumDistancePx)
      : wegweiserMinimumDistancePx;
  const sideOffsetPx = typeof feature.get('seitlicherVersatz') === 'number' ? feature.get('seitlicherVersatz') : 0;
  const dirX = Math.sin(rotation);
  const dirY = -Math.cos(rotation);
  const perpX = Math.cos(rotation);
  const perpY = Math.sin(rotation);
  const bodyHalfWidthPx = bodyWidthPx / 2;
  const bodyHalfHeightPx = bodyHeightPx / 2;
  const attachmentOffsetPx = distancePx;
  const centerOffsetPx = attachmentOffsetPx + bodyHalfWidthPx + gapPx;

  function getAnchorPixel(
    pixelCoordinates: Coordinate | Coordinate[] | Coordinate[][] | Coordinate[][][]
  ): [number, number] {
    if (typeof pixelCoordinates[0] === 'number') {
      return [pixelCoordinates[0] as number, pixelCoordinates[1] as number];
    }

    const first = pixelCoordinates[0] as number[] | number[][];

    if (typeof first[0] === 'number') {
      const coordinate = first as number[];
      return [coordinate[0] ?? 0, coordinate[1] ?? 0];
    }

    const nested = first[0] as number[];
    return [nested[0] ?? 0, nested[1] ?? 0];
  }

  function drawWegweiserBody(
    pixelCoordinates: Coordinate | Coordinate[] | Coordinate[][] | Coordinate[][][],
    state: { context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D }
  ) {
    const context = state.context;
    const [anchorX, anchorY] = getAnchorPixel(pixelCoordinates);
    const bodyCenterPixelX = anchorX + centerOffsetPx * dirX + sideOffsetPx * perpX;
    const bodyCenterPixelY = anchorY + centerOffsetPx * dirY + sideOffsetPx * perpY;
    const attachmentPixelX = anchorX + attachmentOffsetPx * dirX + sideOffsetPx * perpX;
    const attachmentPixelY = anchorY + attachmentOffsetPx * dirY + sideOffsetPx * perpY;
    const bodyStartX = bodyCenterPixelX - bodyHalfWidthPx * dirX;
    const bodyStartY = bodyCenterPixelY - bodyHalfWidthPx * dirY;
    const bodyEndX = bodyCenterPixelX + bodyHalfWidthPx * dirX;
    const bodyEndY = bodyCenterPixelY + bodyHalfWidthPx * dirY;
    const tipBaseLeftX = bodyEndX + bodyHalfHeightPx * perpX;
    const tipBaseLeftY = bodyEndY + bodyHalfHeightPx * perpY;
    const tipBaseRightX = bodyEndX - bodyHalfHeightPx * perpX;
    const tipBaseRightY = bodyEndY - bodyHalfHeightPx * perpY;
    const tipX = bodyEndX + tipLengthPx * dirX;
    const tipY = bodyEndY + tipLengthPx * dirY;
    const backLeftX = bodyStartX - bodyHalfHeightPx * perpX;
    const backLeftY = bodyStartY - bodyHalfHeightPx * perpY;
    const backRightX = bodyStartX + bodyHalfHeightPx * perpX;
    const backRightY = bodyStartY + bodyHalfHeightPx * perpY;

    context.beginPath();
    context.moveTo(anchorX, anchorY);
    context.lineTo(attachmentPixelX, attachmentPixelY);
    context.strokeStyle = '#888888';
    context.lineWidth = selected ? 2 : 1.5;
    context.lineCap = 'butt';
    context.stroke();

    context.beginPath();
    context.moveTo(backLeftX, backLeftY);
    context.lineTo(tipBaseRightX, tipBaseRightY);
    context.lineTo(tipX, tipY);
    context.lineTo(tipBaseLeftX, tipBaseLeftY);
    context.lineTo(backRightX, backRightY);
    context.closePath();
    context.fillStyle = '#ffffff';
    context.strokeStyle = selected ? '#1d4ed8' : '#000000';
    context.lineWidth = selected ? 2.25 : 1.75;
    context.lineJoin = 'miter';
    context.lineCap = 'butt';
    context.fill();
    context.stroke();
  }
  return new Style({
    renderer: drawWegweiserBody,
    hitDetectionRenderer: drawWegweiserBody,
    zIndex: selected ? 40 : 35
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

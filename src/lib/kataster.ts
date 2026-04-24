export type GeoJsonGeometry =
  | {
      type: 'Point';
      coordinates: [number, number];
    }
  | {
      type: 'LineString';
      coordinates: [number, number][];
    }
  | {
      type: string;
      coordinates?: unknown;
    };

export type KatasterCollectionType = 'knoten' | 'pfosten' | 'kanten';

export type KatasterMapRecord = {
  id: string;
  collection: KatasterCollectionType;
  title: string;
  status: string;
  subtitle?: string;
  geomJson: GeoJsonGeometry | null;
  lon: number | null;
  lat: number | null;
};

export type KatasterFeatureInfo = {
  collection: KatasterCollectionType;
  title: string;
  status: string;
  subtitle?: string;
};

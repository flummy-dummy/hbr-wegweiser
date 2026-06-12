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

export type KatasterCollectionType =
  | 'knoten'
  | 'pfosten'
  | 'wegweiser'
  | 'kanten'
  | 'themenroute'
  | 'knotenpunktverbindung';

export type KatasterWegweiserInfo = {
  id: string;
  title: string;
  pfostenId?: string;
  wegweiser_nr?: string;
  offizielle_wegweiser_nr?: string;
  kataster_wegweiser_nr?: string;
  status?: string;
  wegweiser_typ?: string;
  richtung?: string;
  himmelsrichtungGrad?: number;
  himmelsrichtungText?: string;
  darstellungsAbstand?: number;
  seitlicherVersatz?: number;
  anzeigeReihenfolge?: number;
  ziele: string[];
};

export type KatasterMapRecord = {
  id: string;
  collection: KatasterCollectionType;
  title: string;
  status: string;
  subtitle?: string;
  groupKey?: string;
  color?: string;
  geomJson: GeoJsonGeometry | null;
  lon: number | null;
  lat: number | null;
  formData?: {
    knotenNr?: string;
    bezeichnung?: string;
    kreis?: string;
    kommune?: string;
    katasterkennung?: string;
    knotenKennung?: string;
    pfostenKennung?: string;
    pfostenNr?: string;
    pfostenIndex?: number | null;
    nrwPoiNr?: string;
    nrwTyp?: string;
    nrwKommune?: string;
    nrwSourceUrl?: string;
    nrwRawValue?: string;
    nrwObjectId?: string;
    offizielleKnotenNr?: string;
    pfostenTyp?: string;
    pfostenMaterial?: string;
    pfostenFotoKennung?: string;
    linkedKnotenId?: string;
    bemerkung?: string;
    aktiv?: boolean;
    knotenpunktNr?: number | null;
    kantenNr?: string;
    kantenArt?: string;
    kantenLinienstil?: string;
    startKnotenId?: string;
    endKnotenId?: string;
  };
  relatedWegweiser?: KatasterWegweiserInfo[];
};

export type KatasterFeatureInfo = {
  id?: string;
  collection: KatasterCollectionType;
  title: string;
  status: string;
  subtitle?: string;
  details?: Array<{
    label: string;
    value: string;
  }>;
  relatedPfosten?: Array<{
    id: string;
    title: string;
    subtitle?: string;
    status?: string;
    pfostenIndex?: number | null;
  }>;
  relatedWegweiser?: KatasterWegweiserInfo[];
};

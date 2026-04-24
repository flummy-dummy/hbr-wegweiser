migrate((app) => {
  const findCollection = (nameOrId) => {
    try {
      return app.findCollectionByNameOrId(nameOrId);
    } catch (_) {
      return null;
    }
  };

  const ensureCollection = (config) => {
    const existing = findCollection(config.name);

    if (existing) {
      return existing;
    }

    const collection = new Collection({
      type: 'base',
      name: config.name,
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: config.fields,
      indexes: config.indexes
    });

    app.save(collection);

    return collection;
  };

  const knoten = ensureCollection({
    name: 'knoten',
    indexes: ['CREATE UNIQUE INDEX idx_knoten_knoten_nr ON knoten (knoten_nr)'],
    fields: [
      { name: 'knoten_nr', type: 'text', required: true },
      { name: 'bezeichnung', type: 'text' },
      { name: 'beschreibung', type: 'text' },
      { name: 'baulast', type: 'text' },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['bestand', 'planung', 'entfallen'] },
      { name: 'geom_typ', type: 'select', required: true, maxSelect: 1, values: ['Point'] },
      { name: 'geom_json', type: 'json' },
      { name: 'x_utm', type: 'number' },
      { name: 'y_utm', type: 'number' },
      { name: 'lon', type: 'number' },
      { name: 'lat', type: 'number' },
      { name: 'bemerkung', type: 'text' },
      { name: 'aktiv', type: 'bool' }
    ]
  });

  const pfosten = ensureCollection({
    name: 'pfosten',
    indexes: ['CREATE UNIQUE INDEX idx_pfosten_pfosten_nr ON pfosten (pfosten_nr)'],
    fields: [
      { name: 'knoten', type: 'relation', collectionId: knoten.id, maxSelect: 1, cascadeDelete: false },
      { name: 'pfosten_nr', type: 'text', required: true },
      { name: 'typ', type: 'select', required: true, maxSelect: 1, values: ['pfosten', 'laternenmast', 'bestandsmast'] },
      { name: 'material', type: 'select', required: true, maxSelect: 1, values: ['metall', 'holz', 'sonstiges'] },
      { name: 'bestand_status', type: 'select', required: true, maxSelect: 1, values: ['vorhanden', 'geplant', 'zu_entfernen'] },
      { name: 'bemerkung', type: 'text' },
      { name: 'geom_typ', type: 'select', required: true, maxSelect: 1, values: ['Point'] },
      { name: 'geom_json', type: 'json' },
      { name: 'lon', type: 'number' },
      { name: 'lat', type: 'number' },
      { name: 'aktiv', type: 'bool' }
    ]
  });

  const wegweiser = ensureCollection({
    name: 'wegweiser',
    indexes: ['CREATE UNIQUE INDEX idx_wegweiser_wegweiser_nr ON wegweiser (wegweiser_nr)'],
    fields: [
      { name: 'pfosten', type: 'relation', collectionId: pfosten.id, maxSelect: 1, cascadeDelete: false },
      { name: 'wegweiser_nr', type: 'text', required: true },
      {
        name: 'wegweiser_typ',
        type: 'select',
        required: true,
        maxSelect: 1,
        values: ['pfeil', 'knotenpunktschild', 'tabellenwegweiser', 'zwischenwegweiser']
      },
      {
        name: 'bestand_status',
        type: 'select',
        required: true,
        maxSelect: 1,
        values: ['vorhanden', 'geplant', 'zu_entfernen', 'ersetzt']
      },
      {
        name: 'ausrichtung',
        type: 'select',
        required: true,
        maxSelect: 1,
        values: ['nord', 'nordost', 'ost', 'suedost', 'sued', 'suedwest', 'west', 'nordwest']
      },
      { name: 'beschriftung', type: 'select', required: true, maxSelect: 1, values: ['einseitig', 'beidseitig'] },
      { name: 'breite_mm', type: 'number' },
      { name: 'hoehe_mm', type: 'number' },
      { name: 'schildform', type: 'select', required: true, maxSelect: 1, values: ['rechteck', 'schwalbenschwanz', 'pfeil'] },
      { name: 'bemerkung', type: 'text' },
      { name: 'fernziel_text', type: 'text' },
      { name: 'fernziel_entfernung', type: 'number' },
      { name: 'nahziel_text', type: 'text' },
      { name: 'nahziel_entfernung', type: 'number' },
      { name: 'konfiguration_json', type: 'json' },
      { name: 'aktiv', type: 'bool' }
    ]
  });

  const kanten = ensureCollection({
    name: 'kanten',
    indexes: ['CREATE UNIQUE INDEX idx_kanten_kanten_nr ON kanten (kanten_nr)'],
    fields: [
      { name: 'start_knoten', type: 'relation', collectionId: knoten.id, maxSelect: 1, cascadeDelete: false },
      { name: 'end_knoten', type: 'relation', collectionId: knoten.id, maxSelect: 1, cascadeDelete: false },
      { name: 'kanten_nr', type: 'text', required: true },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['bestand', 'planung', 'temporär', 'entfallen'] },
      {
        name: 'art',
        type: 'select',
        required: true,
        maxSelect: 1,
        values: ['netzverbindung', 'themenroute', 'knotenpunktverbindung', 'sonstige']
      },
      { name: 'geom_typ', type: 'select', required: true, maxSelect: 1, values: ['LineString'] },
      { name: 'geom_json', type: 'json' },
      { name: 'laenge_m', type: 'number' },
      { name: 'darstellungsfarbe', type: 'text' },
      { name: 'linienstil', type: 'select', required: true, maxSelect: 1, values: ['durchgezogen', 'gestrichelt', 'punktiert'] },
      { name: 'bemerkung', type: 'text' },
      { name: 'aktiv', type: 'bool' }
    ]
  });

  const themenrouten = ensureCollection({
    name: 'themenrouten',
    indexes: ['CREATE UNIQUE INDEX idx_themenrouten_slug ON themenrouten (slug)'],
    fields: [
      { name: 'name', type: 'text', required: true },
      { name: 'slug', type: 'text', required: true },
      { name: 'kurzlabel', type: 'text' },
      { name: 'beschreibung', type: 'text' },
      { name: 'farbe_rahmen', type: 'text' },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['aktiv', 'planung', 'eingestellt'] },
      { name: 'svg_datei', type: 'file', maxSelect: 1, mimeTypes: ['image/svg+xml'] },
      { name: 'png_datei', type: 'file', maxSelect: 1, mimeTypes: ['image/png'] },
      { name: 'sortierung', type: 'number' },
      { name: 'aktiv', type: 'bool' }
    ]
  });

  const themenrouteKanten = ensureCollection({
    name: 'themenroute_kanten',
    indexes: ['CREATE UNIQUE INDEX idx_themenroute_kanten_unique_pair ON themenroute_kanten (themenroute, kante)'],
    fields: [
      { name: 'themenroute', type: 'relation', collectionId: themenrouten.id, maxSelect: 1, cascadeDelete: true },
      { name: 'kante', type: 'relation', collectionId: kanten.id, maxSelect: 1, cascadeDelete: true },
      { name: 'sortierung', type: 'number' },
      { name: 'richtungsbezug', type: 'select', required: true, maxSelect: 1, values: ['beide', 'hin', 'rueck'] },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['bestand', 'planung'] }
    ]
  });

  const knotenpunktverbindungen = ensureCollection({
    name: 'knotenpunktverbindungen',
    indexes: ['CREATE UNIQUE INDEX idx_knotenpunktverbindungen_verbindung_nr ON knotenpunktverbindungen (verbindung_nr)'],
    fields: [
      { name: 'verbindung_nr', type: 'text', required: true },
      { name: 'bezeichnung', type: 'text' },
      { name: 'start_knoten', type: 'relation', collectionId: knoten.id, maxSelect: 1, cascadeDelete: false },
      { name: 'end_knoten', type: 'relation', collectionId: knoten.id, maxSelect: 1, cascadeDelete: false },
      { name: 'verbindungs_typ', type: 'select', required: true, maxSelect: 1, values: ['knotenpunktnetz', 'netzverbindung', 'planung'] },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['bestand', 'planung', 'entfallen'] },
      { name: 'bemerkung', type: 'text' },
      { name: 'aktiv', type: 'bool' }
    ]
  });

  const knotenpunktverbindungKanten = ensureCollection({
    name: 'knotenpunktverbindung_kanten',
    indexes: ['CREATE UNIQUE INDEX idx_knotenpunktverbindung_kanten_unique_pair ON knotenpunktverbindung_kanten (verbindung, kante)'],
    fields: [
      { name: 'verbindung', type: 'relation', collectionId: knotenpunktverbindungen.id, maxSelect: 1, cascadeDelete: true },
      { name: 'kante', type: 'relation', collectionId: kanten.id, maxSelect: 1, cascadeDelete: true },
      { name: 'sortierung', type: 'number' }
    ]
  });

  ensureCollection({
    name: 'medien',
    fields: [
      { name: 'titel', type: 'text', required: true },
      { name: 'typ', type: 'select', required: true, maxSelect: 1, values: ['standortfoto', 'schildfoto', 'planbild', 'sonstiges'] },
      { name: 'beschreibung', type: 'text' },
      {
        name: 'datei',
        type: 'file',
        maxSelect: 1,
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'application/pdf']
      },
      { name: 'knoten', type: 'relation', collectionId: knoten.id, maxSelect: 1, cascadeDelete: false },
      { name: 'pfosten', type: 'relation', collectionId: pfosten.id, maxSelect: 1, cascadeDelete: false },
      { name: 'wegweiser', type: 'relation', collectionId: wegweiser.id, maxSelect: 1, cascadeDelete: false },
      { name: 'aufnahmedatum', type: 'date' },
      { name: 'fotograf', type: 'text' }
    ]
  });
}, (app) => {
  const deleteCollection = (nameOrId) => {
    try {
      const collection = app.findCollectionByNameOrId(nameOrId);
      app.delete(collection);
    } catch (_) {
      // noop
    }
  };

  deleteCollection('medien');
  deleteCollection('knotenpunktverbindung_kanten');
  deleteCollection('knotenpunktverbindungen');
  deleteCollection('themenroute_kanten');
  deleteCollection('themenrouten');
  deleteCollection('kanten');
  deleteCollection('wegweiser');
  deleteCollection('pfosten');
  deleteCollection('knoten');
});

migrate((app) => {
  const targetCollections = [
    'knoten',
    'pfosten',
    'wegweiser',
    'kanten',
    'themenroute_kanten',
    'knotenpunktverbindungen',
    'knotenpunktverbindung_kanten',
    'medien'
  ];

  const findCollection = (nameOrId) => {
    try {
      return app.findCollectionByNameOrId(nameOrId);
    } catch (_) {
      return null;
    }
  };

  const ensureAutodateField = (collection, fieldConfig) => {
    if (!collection) {
      return;
    }

    const existingField = collection.fields.getByName(fieldConfig.name);

    if (existingField) {
      return;
    }

    collection.fields.add(new AutodateField(fieldConfig));
    app.save(collection);
  };

  for (const collectionName of targetCollections) {
    const collection = findCollection(collectionName);

    if (!collection) {
      continue;
    }

    ensureAutodateField(collection, {
      name: 'created',
      onCreate: true,
      onUpdate: false
    });

    ensureAutodateField(collection, {
      name: 'updated',
      onCreate: true,
      onUpdate: true
    });
  }
}, (_app) => {
  // additive migration: no destructive rollback
});

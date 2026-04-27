migrate((app) => {
  const findCollection = (nameOrId) => {
    try {
      return app.findCollectionByNameOrId(nameOrId);
    } catch (_) {
      return null;
    }
  };

  const ensureNumberField = (collection, fieldConfig) => {
    if (!collection) {
      return;
    }

    const existingField = collection.fields.getByName(fieldConfig.name);

    if (existingField) {
      return;
    }

    collection.fields.add(new NumberField(fieldConfig));
    app.save(collection);
  };

  const knoten = findCollection('knoten');

  ensureNumberField(knoten, {
    name: 'knotenpunkt_nr',
    required: false,
    onlyInt: true,
    min: 1,
    max: 99
  });
}, (_app) => {
  // additive migration: no destructive rollback
});

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

  const removeFieldByName = (collection, fieldName) => {
    if (!collection) {
      return false;
    }

    const existingField = collection.fields.getByName(fieldName);

    if (!existingField) {
      return false;
    }

    collection.fields.removeByName(fieldName);
    return true;
  };

  for (const collectionName of targetCollections) {
    const collection = findCollection(collectionName);

    if (!collection) {
      continue;
    }

    const removedCreated = removeFieldByName(collection, 'created');
    const removedUpdated = removeFieldByName(collection, 'updated');

    if (removedCreated || removedUpdated) {
      app.save(collection);
    }
  }
}, (_app) => {
  // Reparaturmigration: kein Rollback, um keine erneuten doppelten Metadaten einzufuehren
});

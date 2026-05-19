migrate((app) => {
  const findCollection = (nameOrId) => {
    try {
      return app.findCollectionByNameOrId(nameOrId);
    } catch (_) {
      return null;
    }
  };

  const pfosten = findCollection('pfosten');

  if (!pfosten) {
    return;
  }

  if (!pfosten.fields.getByName('pfosten_index')) {
    pfosten.fields.add(
      new NumberField({
        name: 'pfosten_index',
        required: false,
        onlyInt: true,
        min: 1
      })
    );
  }

  if (!pfosten.fields.getByName('pfosten_kennung')) {
    pfosten.fields.add(
      new TextField({
        name: 'pfosten_kennung',
        required: false
      })
    );
  }

  const pfostenNr = pfosten.fields.getByName('pfosten_nr');

  if (!pfostenNr) {
    pfosten.fields.add(
      new TextField({
        name: 'pfosten_nr',
        required: true
      })
    );
  } else {
    pfostenNr.required = true;
  }

  const indexes = Array.isArray(pfosten.indexes) ? pfosten.indexes : [];
  pfosten.indexes = indexes.filter(
    (indexSql) => !/idx_pfosten_pfosten_nr\b/i.test(indexSql) && !/idx_pfosten_pfosten_kennung\b/i.test(indexSql)
  );

  if (!pfosten.indexes.some((indexSql) => /idx_pfosten_pfosten_kennung\b/i.test(indexSql))) {
    pfosten.indexes = [
      ...pfosten.indexes,
      "CREATE UNIQUE INDEX idx_pfosten_pfosten_kennung ON pfosten (pfosten_kennung) WHERE pfosten_kennung != ''"
    ];
  }

  app.save(pfosten);
}, (_app) => {
  // The old global uniqueness of pfosten_nr was fachlich wrong; do not restore it automatically.
});

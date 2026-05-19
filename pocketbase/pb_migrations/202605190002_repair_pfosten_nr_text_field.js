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

  const indexes = Array.isArray(pfosten.indexes) ? pfosten.indexes : [];
  pfosten.indexes = indexes.filter(
    (indexSql) => !/idx_pfosten_pfosten_nr\b/i.test(indexSql) && !/idx_pfosten_pfosten_index\b/i.test(indexSql)
  );

  if (!pfosten.indexes.some((indexSql) => /idx_pfosten_pfosten_kennung\b/i.test(indexSql))) {
    pfosten.indexes = [
      ...pfosten.indexes,
      "CREATE UNIQUE INDEX idx_pfosten_pfosten_kennung ON pfosten (pfosten_kennung) WHERE pfosten_kennung != ''"
    ];
  }

  const pfostenIndex = pfosten.fields.getByName('pfosten_index');

  if (!pfostenIndex) {
    pfosten.fields.add(
      new NumberField({
        name: 'pfosten_index',
        required: false,
        onlyInt: true,
        min: 1
      })
    );
  }

  const pfostenKennung = pfosten.fields.getByName('pfosten_kennung');

  if (!pfostenKennung) {
    pfosten.fields.add(
      new TextField({
        name: 'pfosten_kennung',
        required: false
      })
    );
  }

  const pfostenNr = pfosten.fields.getByName('pfosten_nr');
  const pfostenNrIsText = pfostenNr?.constructor?.name === 'TextField' || pfostenNr?.type === 'text';

  if (pfostenNr && !pfostenNrIsText) {
    pfosten.fields.removeByName('pfosten_nr');
  }

  if (!pfostenNr || !pfostenNrIsText) {
    pfosten.fields.add(
      new TextField({
        name: 'pfosten_nr',
        required: true
      })
    );
  }

  app.save(pfosten);
}, (_app) => {
  // Reparaturmigration: pfosten_nr bleibt Text und darf nicht global eindeutig sein.
});

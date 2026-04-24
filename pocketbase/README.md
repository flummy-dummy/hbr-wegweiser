# PocketBase im selben Repository

Die PocketBase-Migrationen liegen in diesem Repository unter:

- `pocketbase/pb_migrations/`

Die lokale Laufzeitdatenbank sollte **nicht** versioniert werden und liegt typischerweise unter:

- `pocketbase/pb_data/`

## Migrationen ausführen

Die Migrationen werden von der PocketBase-Server-Binary ausgeführt, nicht von der SvelteKit-App.

Beispiel:

```bash
./pocketbase serve --dir ./pocketbase/pb_data --migrationsDir ./pocketbase/pb_migrations
```

Oder manuell:

```bash
./pocketbase migrate up --dir ./pocketbase/pb_data --migrationsDir ./pocketbase/pb_migrations
```

Hinweis:

- Die Migrationssyntax in diesem Ordner verwendet die offizielle PocketBase-JSVM-Syntax `migrate((app) => {}, (app) => {})`.
- Im Repository ist aktuell **kein** PocketBase-Server-Binary fest eingecheckt oder versioniert.
- Die SvelteKit-App verwendet das npm-Paket `pocketbase@0.26.8` als Client-SDK; die Migrationen selbst müssen mit der eingesetzten PocketBase-Serverversion kompatibel ausgeführt werden.

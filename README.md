# hbr-wegweiser

Webanwendung zur Erstellung von HBR-Wegweisern für Radnetze.

## Entwicklung

```bash
npm install
npm run dev
```

Der Dev-Server lauscht auf `0.0.0.0:4173`, damit die App auch über einen vorgeschalteten Host erreichbar ist.

Für lokale Entwicklung eine `.env` im Projektroot anlegen:

```bash
PUBLIC_POCKETBASE_URL=https://pocketbase.example.com
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=change-me
```

Die Variable ist öffentlich. Sie wird im Browser-Bundle sichtbar und darf daher keine Secrets enthalten.

## Build

```bash
npm run build
npm run preview
npm run start
```

## Umgebungsvariablen

Für PocketBase wird ausschließlich diese öffentliche Variable verwendet:

```bash
PUBLIC_POCKETBASE_URL=https://pocketbase.example.com
```

Wenn die Variable fehlt, protokolliert der Server eine Warnung. Die App bleibt stabil, zeigt aber einen kontrollierten Hinweis und lädt keine PocketBase-Stammdaten.

Für spätere serverseitige Schreibzugriffe sind zusätzlich diese privaten Variablen vorbereitet:

```bash
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=change-me
```

Unterschied:

- `PUBLIC_POCKETBASE_URL` ist öffentlich und darf im Browser sichtbar sein.
- `POCKETBASE_ADMIN_EMAIL` und `POCKETBASE_ADMIN_PASSWORD` sind privat und dürfen nur serverseitig verwendet werden.
- Private Variablen dürfen nicht in Frontend-Code importiert werden.

## Deployment auf Node/VPS

Das Projekt ist für einen Node-Prozess hinter einem Reverse Proxy ausgelegt.

1. Abhängigkeiten installieren
2. `PUBLIC_POCKETBASE_URL` setzen
3. `npm run build`
4. `npm run start`
5. Nginx oder Caddy auf den Node-Prozess auf Port `4173` routen

In Coolify die Variable unter `Environment Variables` für den Service setzen:

```bash
PUBLIC_POCKETBASE_URL=https://pocketbase.example.com
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=change-me
```

Die privaten Variablen gehören nur in den Serverprozess. Sie dürfen nicht im Frontend verwendet oder als `PUBLIC_...`-Variablen angelegt werden.

Beispiel mit PM2:

```bash
PUBLIC_POCKETBASE_URL=https://pocketbase.example.com npm run build
PUBLIC_POCKETBASE_URL=https://pocketbase.example.com PORT=4173 HOST=0.0.0.0 pm2 start npm --name hbr-wegweiser -- run start
```

Für externe Vorschau über `wegweiser.holbes.de` ist `preview.allowedHosts` bereits gesetzt.

## Projektstruktur

- `src/routes/+page.svelte`: Startseite
- `src/routes/editor/test/+page.svelte`: Editor-Testseite mit Formular und SVG-Vorschau
- `static/`: statische Dateien wie das Favicon

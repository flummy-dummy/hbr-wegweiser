# PocketBase Auth und Rules

## Auth-Collection

Lege eine normale PocketBase Auth-Collection fuer App-Nutzer an, zum Beispiel `users`.

Empfohlene Felder:

- `email`
- `password`
- `name`
- `rolle`

Empfohlene Werte fuer `rolle`:

- `admin`
- `bearbeitung`
- `lesen`

## Empfohlene Collection-Rules

Die folgenden Rules passen zur jetzt eingebauten SvelteKit-Auth:

### Lesen

Nur eingeloggte Nutzer:

```text
@request.auth.id != ""
```

### Create / Update

Nur `admin` oder `bearbeitung`:

```text
@request.auth.rolle = "admin" || @request.auth.rolle = "bearbeitung"
```

### Delete

`admin` oder `bearbeitung` fuer fachliche Collections:

```text
@request.auth.rolle = "admin" || @request.auth.rolle = "bearbeitung"
```

## Empfohlene Anwendung auf Collections

Setze diese Rules mindestens fuer fachliche Collections:

- `knoten`
- `pfosten`
- `kanten`
- `themenrouten`
- `themenroute_kanten`
- `knotenpunktverbindungen`
- `knotenpunktverbindung_kanten`
- `medien`

## Hinweise

- Wenn serverseitige SvelteKit-Routen ueber den eingeloggten Nutzer in `locals.pb` schreiben, greifen diese Rules auch dort.
- Fuer streng interne Systemaufgaben kann weiterhin ein Superuser-Client sinnvoll sein, aber nicht als dauerhafter App-Login fuer normale Nutzer.
- Fuer echte System- oder Benutzerverwaltung solltest du separat weiter nur `admin` zulassen.

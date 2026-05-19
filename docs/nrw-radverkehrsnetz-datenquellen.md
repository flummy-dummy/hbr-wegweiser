# NRW-Radverkehrsnetz: Datenquellen und Webdienste

Stand: 2026-05-14

## Zusammenfassung

Die Karte unter `https://radservice.radroutenplaner.nrw.de/rrp/nrwrvn/cgi?lang=DE` nutzt mehrere interne CGI-/XML-Dienste und externe WMS-Hintergründe. Für unsere Anwendung ist der wichtigste Dienst der XML-basierte ObjectSearch-Endpunkt:

`https://radservice.radroutenplaner.nrw.de/rrp/nrwrvn/cgi/service/objects`

Darüber sind in ETRS89/UTM32 (`urn:adv:crs:ETRS89_UTM32`, praktisch EPSG:25832) u. a. folgende Objektarten abrufbar:

- POIs wie `Zielwegweiser NRW`, `Zwischenwegweiser NRW`, `Knotenpunkt NRW`
- Adressen
- Routen bzw. Netzobjekte wie `Knotenpunktnetz` und `Radverkehrsnetz NRW`
- Kategorie- und Textsuchen, z. B. nach `MS053-1`

Katasterblatt-PDFs sind nicht direkt im ObjectSearch-XML enthalten, aber über eine HTML-Verzweigung erreichbar:

1. `https://www.radroutenplaner.nrw.de/rrpPoiVerzweigungInfo.asp?layer=...&dbspalte=...`
2. `https://www.radverkehrsnetz.nrw.de/Pfosten_info.asp?POI=...&kategorie=...`
3. PDF-URL, z. B. `https://www.radverkehrsnetz.nrw.de/PDF/MS/MS053.pdf`

Die stabilste automatisierte Quelle für Katasterkennungen ist aktuell `service/objects`. PDF-Links sind nutzbar, beruhen aber auf HTML-Verzweigung und sollten defensiv behandelt werden.

## Endpunktübersicht

| Zweck | Endpunkt | Methode | Format | Koordinaten/SRS | Stabilität | Eignung |
|---|---:|---:|---:|---:|---:|---|
| Objekt-, POI-, Adress- und Routensuche | `https://radservice.radroutenplaner.nrw.de/rrp/nrwrvn/cgi/service/objects` | POST | XML Request/Response, `iso-8859-15` | `urn:adv:crs:ETRS89_UTM32` | mittel bis gut, wird direkt von der Webseite genutzt | Primäre Quelle für automatische NRW-Katastererkennung |
| Kartenbild Radnetz/POIs/Themenrouten | `https://radservice.radroutenplaner.nrw.de/rrp/nrwrvn/cgi/service/map` | GET | Bild, meist PNG | `view=minX,minY,maxX,maxY` in UTM32 | intern, eher instabil | Nur Visualisierung, nicht für persistente Fachdaten |
| POI-Detail-Verzweigung | `https://www.radroutenplaner.nrw.de/rrpPoiVerzweigungInfo.asp` | GET | HTML mit URL im Body | keine | intern, HTML | Kann PDF-/Detailseite finden, Scraping nötig |
| Pfosten-Detailseite | `https://www.radverkehrsnetz.nrw.de/Pfosten_info.asp` | GET | HTML/JavaScript | keine | intern, HTML | Liefert per JS `var adresse = '...pdf'` |
| Katasterblatt | `https://www.radverkehrsnetz.nrw.de/PDF/{KENNUNG_PREFIX}/{KENNUNG}.pdf` | GET | PDF | keine | gut, sofern URL bekannt | PDF speichern/verlinken, nicht als strukturierte Quelle |
| POI/Route-Bild | `/rrp/nrwrvn/cgi/service/image` | GET | Bild | keine | intern | Nur Icons/Abbildungen, für uns nicht relevant |
| Routenberechnung | `/rrp/nrwrvn/cgi/service/journey` | POST | XML | UTM32 | intern | Für spätere Routenfunktionen, nicht für Knoten-Katasterfelder |
| Dokumente zur Route | `/rrp/nrwrvn/cgi/document/...` | POST | PDF/Download | Request-XML | intern | Nur bei vollständigem Routenrequest sinnvoll |
| RRP Overlay WMS | `https://geomap.ivv-aachen.de/rpnt/wms` | GET | OGC WMS | EPSG:25832, EPSG:4326 | besser als CGI-Kartenbild, aber FeatureInfo nur begrenzt geprüft | Kartenoverlay, eventuell FeatureInfo-Test später |
| TopPlusOpen WMS | `https://sgx.geodatenzentrum.de/wms_topplus_open` | GET | OGC WMS | EPSG:25832 u. a. | gut | Hintergrundkarte |
| Orthofoto NRW WMS | `https://www.wms.nrw.de/geobasis/wms_nw_dop` | GET | OGC WMS | EPSG:25832 | gut | Hintergrundkarte |

## Netzwerkanfragen der Seite

### Kartenstart

Die Seite lädt u. a. diese Skripte und initialisiert folgende Dienste:

- `RRPMapContext("/rrp/nrwrvn/cgi/service/objects", 0.078125, 0.01953125, ...)`
- `MapLayerRRP("/rrp/nrwrvn/cgi/service/map", "RRP")`
- `RRPFormularRoute(..., "/rrp/nrwrvn/cgi/service/journey")`
- mehrere `MapLayerTiles(...)` für externe WMS-Hintergründe

Wichtige WMS-Initialisierungen aus dem Seiten-JavaScript:

```text
https://geomap.ivv-aachen.de/mapsHQ/wms?...LAYERS=osm_rrp_utm...SRS=EPSG:25832
https://geomap.ivv-aachen.de/maps/wms?...LAYERS=osm_rrp_utm_schummerung...SRS=EPSG:25832
https://geomap.ivv-aachen.de/mapsHQ/wms?...LAYERS=osm_rrp_grau...SRS=EPSG:25832
https://sgx.geodatenzentrum.de/wms_topplus_open?...LAYERS=web...CRS=EPSG:25832
https://geomap.ivv-aachen.de/rpnt/wms?...LAYERS=rrp_gesamt_overlay...SRS=EPSG:25832
https://www.wms.nrw.de/geobasis/wms_nw_dop?...layers=nw_dop_rgb...srs=EPSG:25832
```

### Rechtsklick / Objektabfrage

Der Rechtsklick nutzt keinen klassischen WMS-GetFeatureInfo-Request, sondern `service/objects` mit XML.

Die Seite macht zuerst eine Punktabfrage:

```xml
<Request>
  <ObjectInfo>
    <ObjectSearch>
      <Coordinate srsName="urn:adv:crs:ETRS89_UTM32">X,Y</Coordinate>
      <Classes>
        <Address/>
        <Route/>
      </Classes>
    </ObjectSearch>
    <Options>
      <Output>
        <SRSName>urn:adv:crs:ETRS89_UTM32</SRSName>
      </Output>
    </Options>
  </ObjectInfo>
</Request>
```

Danach folgt eine Rechteckabfrage um ca. 50 m für POIs:

```xml
<Request>
  <ObjectInfo>
    <ObjectSearch>
      <CoordinateRectangle srsName="urn:adv:crs:ETRS89_UTM32">x1,y1,x2,y2</CoordinateRectangle>
      <Classes>
        <POI/>
      </Classes>
    </ObjectSearch>
    <Options>
      <Output>
        <SRSName>urn:adv:crs:ETRS89_UTM32</SRSName>
      </Output>
    </Options>
  </ObjectInfo>
</Request>
```

### Detail / Katasterblatt

Bei Klick auf einen POI ruft die Seite auf:

```text
https://www.radroutenplaner.nrw.de/rrpPoiVerzweigungInfo.asp?layer=Zielwegweiser%20NRW&dbspalte=491150
```

Beispielantwort:

```html
<body id="bodyID" leftmargin="0">
https://www.radverkehrsnetz.nrw.de/Pfosten_info.asp?POI=491150&kategorie=Zielwegweiser NRW
</body>
```

Die Pfosten-Detailseite enthält dann JavaScript:

```html
<script>
var adresse = 'https://www.radverkehrsnetz.nrw.de/PDF/MS/MS053.pdf';
</script>
```

Das PDF ist direkt abrufbar:

```text
GET https://www.radverkehrsnetz.nrw.de/PDF/MS/MS053.pdf
Content-Type: application/pdf
```

## Objektartenübersicht

| Objektart / Kategorie | Abrufbar über | Wichtigste Felder | Beispiel | Eignung |
|---|---|---|---|---|
| Zielwegweiser NRW | `service/objects`, Klasse `POI`, Kategorie `Zielwegweiser NRW` | `ID`, `Type`, `Value`, `Coords`, `POI/Nr`, `POI/Category` | `Value=MS053-1, Münster`, `Nr=491150` | Sehr gut für `katasterkennung`, `nrw_poi_nr`, `nrw_typ`, `nrw_kommune` |
| Zwischenwegweiser NRW | `service/objects`, Klasse `POI`, Kategorie `Zwischenwegweiser NRW` | wie oben | Kategorie `Zwischenwegweiser NRW` | Gut, gleiche Felder wie Zielwegweiser |
| Knotenpunkt NRW | `service/objects`, Klasse `POI`, Kategorie `Knotenpunkt NRW` | `Value` enthält häufig Nummer und Kommune; `POI/Nr` | `Value=67, Münster`, `Category=Knotenpunkt NRW` | Gut für numerische Knotenpunktnummer, sofern eindeutig |
| Externe Wegweiser | `service/objects`, Klasse `POI`, Kategorien `Zielwegweiser Extern...`, `Zwischenwegweiser Extern...`, `Wegweiser Extern` | wie POI | keine NRW-Katasterkennung garantiert | Nur optional, nicht für NRW-Katasterfelder |
| Adresse | `service/objects`, Klasse `Address` | `ID`, `Value`, `Descr`, `Coords` | `Schmitthausweg 4, 48161 Münster` | Für Kontext/Debug, nicht für Katasterkennung |
| Route / Netzobjekt | `service/objects`, Klasse `Route` | `ID`, `Value`, `Coords`, `BBox`, `Route/Nr` | `Knotenpunktnetz`, `Nr=1999`; `Radverkehrsnetz NRW`, `Nr=2000` | Gut zur Prüfung, ob Punkt auf Netz liegt |
| Themenroute | HTML-Routenliste und `service/objects`/`service/map` | Name, BBox, Route-Nr. | `100 Schlösser Route`, `Route/Nr=23` | Live-Anzeige, eher nicht persistieren |
| Katasterblatt PDF | HTML-Verzweigung/PDF-URL | PDF-Datei, indirekt aus `Pfosten_info.asp` | `PDF/MS/MS053.pdf` | URL in `nrw_source_url` speichern, PDF nur bei Bedarf laden |
| Hintergrundkarte | WMS | Bildkacheln | TopPlusOpen, Ortho NRW | Nicht speichern |
| RRP Overlay / Radnetz-Layer | WMS oder interner `service/map` | Bildlayer, ggf. WMS-FeatureInfo | `rrp_nrw_radverkehrsnetz`, `rrp_nrw_knotenpunktnetz` | Kartenanzeige; strukturierte Nutzung zuerst weiter prüfen |

## Feldübersicht nach Response

### `service/objects` / POI

| XML-Feld | Bedeutung | Beispiel | PocketBase-Empfehlung |
|---|---|---|---|
| `Object/ID` | interne Objekt-ID | `154007` | optional nicht speichern |
| `Object/Type` | Objektklasse | `POI` | nicht nötig |
| `Object/Value` | Anzeigename; enthält oft Katasterkennung und Kommune | `MS053-1, Münster` | `katasterkennung` und Kommune daraus ableiten |
| `Object/Descr` | Beschreibung, oft leer | leer | nicht speichern |
| `Object/Coords` | UTM32-Koordinate | `401318.000,5764499.000` | optional für Debug/Qualität, aktuell nicht nötig |
| `Object/BBox` | Bounding Box, bei POI oft leer | leer | nicht speichern |
| `Object/POI/Nr` | POI-Nummer / Detail-ID | `491150` | `nrw_poi_nr` |
| `Object/POI/Category` | Kategorie/Typ | `Zielwegweiser NRW` | `nrw_typ` |
| abgeleitet aus `Value` | Katasterkennung | `MS053-1` | `katasterkennung` |
| abgeleitet aus `Value` | Kommune | `Münster` | `nrw_kommune`, ggf. `kommune` nur wenn leer |

### `service/objects` / Route

| XML-Feld | Bedeutung | Beispiel | Eignung |
|---|---|---|---|
| `Object/ID` | interne Route-ID | `766` | nicht stabil genug zum Speichern |
| `Object/Value` | Routen-/Netzname | `Knotenpunktnetz` | Live-Prüfung |
| `Object/Coords` | nächster Punkt auf Route | `401318.268,5764499.512` | Distanzprüfung möglich |
| `Object/BBox` | Netz-/Routen-BBox | `251515.000,5554896.000,652802.000,5845494.000` | Anzeige/Zoom |
| `Object/Route/Nr` | Routen-Nr. | `1999` | `1999` = Knotenpunktnetz, `2000` = Radverkehrsnetz NRW |

## Beispielabfragen

### ObjectSearch nach Katasterkennung

```bash
curl -X POST 'https://radservice.radroutenplaner.nrw.de/rrp/nrwrvn/cgi/service/objects' \
  -H 'Content-Type: text/xml;charset=UTF-8' \
  --data '<Request><ObjectInfo><ObjectSearch><String>MS053-1</String><Classes><POI/></Classes></ObjectSearch><Options><Output><SRSName>urn:adv:crs:ETRS89_UTM32</SRSName></Output></Options></ObjectInfo></Request>'
```

Gekürzte Antwort:

```xml
<Object>
  <ID>154007</ID>
  <Type>POI</Type>
  <Value>MS053-1, Münster</Value>
  <Coords>401318.000,5764499.000</Coords>
  <POI>
    <Nr>491150</Nr>
    <Category>Zielwegweiser NRW</Category>
  </POI>
</Object>
```

### ObjectSearch an Koordinate / Rechteck

```bash
curl -X POST 'https://radservice.radroutenplaner.nrw.de/rrp/nrwrvn/cgi/service/objects' \
  -H 'Content-Type: text/xml;charset=UTF-8' \
  --data '<Request><ObjectInfo><ObjectSearch><CoordinateRectangle srsName="urn:adv:crs:ETRS89_UTM32">401268,5764449,401368,5764549</CoordinateRectangle><Classes><POI/></Classes></ObjectSearch><Options><Output><SRSName>urn:adv:crs:ETRS89_UTM32</SRSName></Output></Options></ObjectInfo></Request>'
```

Gekürzte Antwort:

```xml
<Object>
  <ID>103136</ID>
  <Type>POI</Type>
  <Value>67, Münster</Value>
  <Coords>401337.000,5764483.000</Coords>
  <POI>
    <Nr>2427</Nr>
    <Category>Knotenpunkt NRW</Category>
  </POI>
</Object>
<Object>
  <ID>154007</ID>
  <Type>POI</Type>
  <Value>MS053-1, Münster</Value>
  <Coords>401318.000,5764499.000</Coords>
  <POI>
    <Nr>491150</Nr>
    <Category>Zielwegweiser NRW</Category>
  </POI>
</Object>
```

### ObjectSearch an Punkt für Adresse und Netze

```bash
curl -X POST 'https://radservice.radroutenplaner.nrw.de/rrp/nrwrvn/cgi/service/objects' \
  -H 'Content-Type: text/xml;charset=UTF-8' \
  --data '<Request><ObjectInfo><ObjectSearch><Coordinate srsName="urn:adv:crs:ETRS89_UTM32">401318,5764499</Coordinate><Classes><Address/><Route/></Classes></ObjectSearch><Options><Output><SRSName>urn:adv:crs:ETRS89_UTM32</SRSName></Output></Options></ObjectInfo></Request>'
```

Gekürzte Antwort:

```xml
<Object>
  <Type>Address</Type>
  <Value>Schmitthausweg 4, 48161 Münster (Nienberge)</Value>
  <Coords>401295.000,5764529.000</Coords>
</Object>
<Object>
  <Type>Route</Type>
  <Value>Knotenpunktnetz</Value>
  <Coords>401318.268,5764499.512</Coords>
  <BBox>251515.000,5554896.000,652802.000,5845494.000</BBox>
  <Route><Nr>1999</Nr></Route>
</Object>
<Object>
  <Type>Route</Type>
  <Value>Radverkehrsnetz NRW</Value>
  <Route><Nr>2000</Nr></Route>
</Object>
```

### Detailabfrage eines POI

```bash
curl 'https://www.radroutenplaner.nrw.de/rrpPoiVerzweigungInfo.asp?layer=Zielwegweiser%20NRW&dbspalte=491150'
```

Gekürzte Antwort:

```html
https://www.radverkehrsnetz.nrw.de/Pfosten_info.asp?POI=491150&kategorie=Zielwegweiser NRW
```

Danach:

```bash
curl 'https://www.radverkehrsnetz.nrw.de/Pfosten_info.asp?POI=491150&kategorie=Zielwegweiser%20NRW'
```

Gekürzte Antwort:

```html
<script>
var adresse = 'https://www.radverkehrsnetz.nrw.de/PDF/MS/MS053.pdf';
</script>
```

### Abruf eines Katasterblatts

```bash
curl -I 'https://www.radverkehrsnetz.nrw.de/PDF/MS/MS053.pdf'
```

Beispiel-Header:

```text
HTTP/2 200
content-type: application/pdf
content-length: 411728
access-control-allow-origin: *
```

### Kartenlayer / interner Kartenbilddienst

Der RRP-Layer baut URLs nach folgendem Muster:

```text
https://radservice.radroutenplaner.nrw.de/rrp/nrwrvn/cgi/service/map
  ?view=minX,minY,maxX,maxY
  &size=width,height
  &poi=Zielwegweiser NRW,Zwischenwegweiser NRW,Knotenpunkte
  &layers=Radnetz
  &routes=...
  &routesNR=...
  &shapes=...
```

Dieser Dienst liefert ein Kartenbild und ist für strukturierte Daten nicht geeignet. Der Dienst kann temporär `503` liefern und sollte nicht als Datenquelle für Persistenz verwendet werden.

### WMS Overlay

Capabilities:

```bash
curl 'https://geomap.ivv-aachen.de/rpnt/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities'
```

Relevante Layer:

```text
rrp_gesamt_overlay       RRP Gesamt Overlay
rrp_overlay_th           RRP Overlay TH
rrp_th_radnetz           RRP Netz TH
rrp_th_themenrouten      RRP Themenrouten TH
rrp_nrw_radnetz          RRP Netz NRW
rrp_nrw_themenrouten     RRP Themenrouten NRW
rrp_nrw_radverkehrsnetz  RRP Radverkehrsnetz NRW
rrp_nrw_knotenpunktnetz  RRP Knotenpunktnetz NRW
```

Der WMS meldet `GetMap` und `GetFeatureInfo` mit `text/plain`. Ob FeatureInfo strukturierte Attribute liefert, muss separat gegen konkrete Pixel/BBox geprüft werden.

## Unterscheidung Knoten, Pfosten, Wegweiser und NRW-POI

Die Katasterdaten duerfen fachlich nicht als eine einzige Kennung behandelt werden. Das NRW-Webobjekt aus `ObjectSearch` ist nur der Einstiegspunkt und entspricht haeufig einem Pfosten oder Wegweiser-POI, nicht zwingend dem Knoten aus dem Katasterblatt.

Beispiel aus dem Katasterblatt `ST069`:

| Ebene | Beispiel | Bedeutung |
| --- | --- | --- |
| Knoten | `ST069` | Katasterkennung des Knotens bzw. Standortes |
| Offizielle Knoten-Nr. | `34188605` | numerische Knoten-Nr. aus Katasterblatt/Detailquelle |
| Knotenpunktnummer | `54` | Nummer im roten Knotenpunktschild |
| Knotenbeschreibung | `Vorplatz Radstation Burgsteinfurt` | fachliche Standortbeschreibung |
| Kommune | `Steinfurt` | Stadt/Gemeinde |
| Pfosten | `ST069-1`, `ST069-2` | einzelne Pfosten am Knoten |
| Wegweiser | `349170`, `345104`, `345717`, `342825`, `342826`, `346917`, `349171`, `346918`, `346919`, `346920` | einzelne Wegweiser an einem Pfosten |
| NRW-Web-POI | z. B. `689728` | technische POI-/Webobjekt-Nr. aus ObjectSearch oder Detailseite |

Wichtige Regel: `nrw_poi_nr` ist nicht die offizielle Knoten-Nr. Im Beispiel kann ein Web-POI wie `689728` auf einen Pfosten oder ein Objekt der Webkarte zeigen, waehrend die Knoten-Nr. aus dem Katasterblatt `34188605` lautet. Diese Werte duerfen nicht gleichgesetzt werden.

### Ableitungslogik fuer Kennungen

| Gefundener Wert | Ableitung | Nicht ableiten |
| --- | --- | --- |
| `ST069-1` | `knoten_kennung=ST069`, `pfosten_kennung=ST069-1`, `pfosten_nr=1` | keine `offizielle_knoten_nr`, keine `knoten_nr=ST069-1` |
| `ST069-2` | `knoten_kennung=ST069`, `pfosten_kennung=ST069-2`, `pfosten_nr=2` | keine `offizielle_knoten_nr`, keine `knoten_nr=ST069-2` |
| `ST069` | `knoten_kennung=ST069` | keine Pfostenkennung |
| `34188605` aus Katasterblatt/Detailquelle | `offizielle_knoten_nr=34188605` | nicht aus `nrw_poi_nr` erraten |
| `54` als Knotenpunktnummer | `knotenpunkt_nummer=54` bzw. vorhandenes Feld `knotenpunkt_nr` | nicht aus `ST069-1` ableiten |

### Empfohlene PocketBase-Felder

Bereits vorhandene Felder koennen weiter genutzt werden, sollten aber fachlich eindeutig belegt werden:

- `katasterkennung`: vorlaeufig als Knotenkennung, z. B. `ST069`; perspektivisch besser `knoten_kennung`.
- `knoten_kennung`: Knotenkennung, z. B. `ST069`.
- `pfosten_kennung`: Pfostenkennung, z. B. `ST069-1`.
- `pfosten_nr`: Nummer des Pfostens am Knoten, z. B. `1`.
- `nrw_poi_nr`: Web-/POI-Nr., z. B. `689728`.
- `nrw_typ`: Webkategorie, z. B. `Zielwegweiser NRW`.
- `nrw_kommune`: Kommune aus Webdaten.
- `nrw_source_url`: Detail-/PDF-/Quell-URL.
- `nrw_raw_value`: Rohwert aus ObjectSearch, z. B. `ST069-1, Steinfurt`.
- `nrw_object_id`: technische ObjectSearch-ID.
- `offizielle_knoten_nr`: nur echte numerische Knoten-Nr. aus Katasterblatt/Detailquelle.
- `knotenpunkt_nr`: nur die Nummer im Knotenpunktschild, z. B. `54`.

Empfehlung fuer `offizielle_knoten_nr`: fachlich ist ein Textfeld besser als ein Number-Feld mit Default `0`. Die Nummer ist ein Identifikator, keine Rechengroesse. Ein leeres Textfeld unterscheidet sauber zwischen "nicht bekannt" und einer echten Nummer. Wenn das Feld als Number modelliert bleibt, darf kein Default `0` gesetzt sein; sonst wirkt `0` wie ein fachlicher Wert.

Noch zu ergaenzen:

- `knotenbeschreibung `
- `pfosten_typ`
- `material`
- `foto_kennung`
- eigene Wegweiser-Collection oder Felder fuer `wegweiser_nr`, `wegweiser_typ`, `ausrichtung`, `bestand`, `beschriftung`, `wegweiser_masse`, Ziele, Entfernungen und Einschuebe

### Konsequenz fuer die Anwendung

Beim Anlegen eines Knotens darf ein ObjectSearch-Treffer wie `ST069-1, Steinfurt` nicht mehr direkt als `knoten_nr` verwendet werden. Die Anwendung leitet daraus nur `ST069` als Knotenkennung sowie `ST069-1` als Pfostenkennung ab. `knoten_nr` wird nur mit einer echten offiziellen Knoten-Nr. belegt; wenn diese nicht vorhanden ist, bleibt der Fallback eine interne vorlaeufige Nummer wie `VORL-ST-0001`.

## Bewertung

### Zuverlässig automatisiert nutzbar

- `service/objects` für POIs, Adressen und Route/Netzobjekte.
- Direkte Katasterblatt-PDF-URLs, wenn sie über Detailseite oder Kennung bekannt sind.
- Externe WMS-Hintergründe für reine Darstellung.

### Nur über HTML-Scraping nutzbar

- PDF-Verzweigung über `rrpPoiVerzweigungInfo.asp` und `Pfosten_info.asp`.
- Detailseiten liefern keine saubere JSON/XML-Fachstruktur, sondern HTML bzw. JavaScript mit URL.

### Eher instabil

- Interne JavaScript-/CGI-Endpunkte wie `service/map`, `service/journey`, `cgi/document/...`.
- Routen-/Dokumentrequests hängen stark an der internen Webapp-Struktur.
- HTML-Seiten mit Encoding-/Umlautthemen (`iso-8859-15`, teils falsch deklarierte Inhalte).

### In PocketBase speichern

Für gefundene NRW-Katasterobjekte sinnvoll:

- `katasterkennung` bzw. besser `knoten_kennung`: z. B. `MS053`
- `pfosten_kennung`: z. B. `MS053-1`
- `pfosten_nr`: z. B. `1`
- `nrw_poi_nr`: z. B. `491150`
- `nrw_typ`: z. B. `Zielwegweiser NRW`
- `nrw_raw_value`: z. B. `MS053-1, Münster`
- `nrw_kommune`: z. B. `Münster`
- `nrw_source_url`: PDF- oder Detail-URL, z. B. `https://www.radverkehrsnetz.nrw.de/PDF/MS/MS053.pdf`
- `nrw_object_id`: technische ObjectSearch-ID, falls benoetigt
- `offizielle_knoten_nr`: nur wenn aus einer echten numerischen Quelle vorhanden

Nicht automatisch ableiten:

- `knotenpunkt_nr` aus `MS053-1`. Diese Kennung ist keine Knotenpunktnummer.
- `offizielle_knoten_nr` aus `nrw_poi_nr`.
- `knoten_nr` aus einer Pfostenkennung wie `MS053-1`.
- numerische interne IDs wie `Object/ID`, sofern nicht fachlich benötigt.

### Nur live abfragen

- Kartenbilder aus `service/map`
- WMS-Kacheln/Hintergründe
- Routenberechnung und Routen-PDFs
- POI-Icons aus `service/image`

## Empfehlungen für die weitere Integration

1. `service/objects` als primäre Quelle beibehalten.
2. Koordinaten immer nach ETRS89/UTM32 transformieren und als `X,Y` senden.
3. Für neue Knoten mehrere Suchradien verwenden, z. B. 5, 10, 25, 50, 100 m.
4. POI-Kategorien im Request zunächst offen lassen und im Code defensiv filtern.
5. `Knotenpunkt NRW` separat auswerten: `Value=67, Münster` kann eine echte Knotenpunktnummer enthalten.
6. `Zielwegweiser NRW` und `Zwischenwegweiser NRW` für Katasterkennung und POI-Nr. verwenden.
7. Detail-/PDF-URLs nur als Komfortquelle nutzen und nicht als einzige Grundlage der Fachdatenlogik.
8. WMS-Layer für Anzeige prüfen, aber nicht als strukturierte Datenquelle priorisieren.
9. Response-Encoding weiter explizit behandeln (`iso-8859-15`), damit Ortsnamen wie `Münster` korrekt dekodiert werden.
10. Externe und interne Kategorien getrennt speichern oder filtern, falls künftig auch nicht-NRW-Wegweiser relevant werden.

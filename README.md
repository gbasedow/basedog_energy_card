# basedog_sankey_card

Eine experimentelle Home-Assistant-Lovelace-Karte zur Darstellung von **Energieverbrauch als Sankey-Diagramm**.

## Funktionen

- Zentrale Energie-Verbrauchsentität frei wählen
- Weitere Energieentitäten einzeln oder anhand von Home-Assistant-Labels auswählen
- Auswertungsdauer in Minuten, Stunden, Tagen oder Wochen
- Unabhängiger Bezugszeitpunkt: **Jetzt** oder ein fester Zeitpunkt
- Ebenen in frei wählbarer Reihenfolge: **Etage → Bereich → Entität**
- Konfiguration über den visuellen Karteneditor (GUI)
- Anzeige nicht zugeordneten Verbrauchs und Warnung bei möglicher Doppelzählung

## Installation über HACS

1. HACS in Home Assistant öffnen und **Dashboard** auswählen.
2. Über das Menü **Benutzerdefinierte Repositories** hinzufügen.
3. Repository-URL `https://github.com/gbasedow/basedog_sankey_card` und Typ **Dashboard** wählen.
4. `basedog_sankey_card` installieren und Home Assistant neu laden.
5. Im Dashboard eine neue Karte hinzufügen: **basedog_sankey_card**.

Alternativ kann die Ressource `dist/basedog-sankey-card.js` als JavaScript-Modul in Home Assistant eingebunden werden.

## Konfiguration

Alle Felder sind im visuellen Editor verfügbar. Beispiel-YAML:

```yaml
type: custom:basedog-sankey-card
title: Energiefluss
entity: sensor.gesamtenergie
entities:
  - sensor.wohnzimmer_energie
  - sensor.kueche_energie
labels:
  - stromverbrauch
duration: 24
duration_unit: hours
time_mode: now
end_time: ""
levels:
  - floor
  - area
  - entity
```

`time_mode: fixed` verwendet den in `end_time` gewählten Zeitpunkt statt „Jetzt“.

## Voraussetzungen und Einschränkungen

Die Sensoren müssen geeignete **Langzeitstatistiken** mit Energieeinheiten (z. B. kWh) in Home Assistant besitzen. Die Karte fragt die Recorder-Statistiken über die Home-Assistant-WebSocket-API ab. Es werden aktuell stündliche Statistikpunkte ausgewertet; sehr kurze Zeitfenster und die erste Teilstunde können deshalb ungenau sein. Die Karte wurde als erste Version erstellt und noch nicht in einer realen Home-Assistant-Installation getestet.

**Hinweis:** Dieses Repository ist derzeit privat. Damit HACS es als benutzerdefiniertes Repository regulär beziehen kann, muss es öffentlich zugänglich sein. Eine Veröffentlichung im offiziellen HACS-Standardkatalog ist ein separater Schritt.

## Entwicklung

`npm run check` prüft die JavaScript-Syntax. Die lauffähige Datei liegt in `dist/basedog-sankey-card.js`.

Lizenz: MIT.

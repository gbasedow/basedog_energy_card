# basedog_energy_card

Eine experimentelle Home-Assistant-Lovelace-Karte zur Darstellung von **Energieverbrauch als Sankey-Diagramm**.

## Funktionen

- Zentrale Energie-Verbrauchsentität frei wählen
- Weitere Energieentitäten einzeln oder anhand von Home-Assistant-Labels auswählen
- Auswertungsdauer in Minuten, Stunden, Tagen oder Wochen
- Unabhängiger Bezugszeitpunkt: **Jetzt** oder ein fester Zeitpunkt
- Ebenen **Etage**, **Bereich**, **Entität** einzeln im GUI aktivierbar; feste Reihenfolge **Etage → Bereich → Entität**
- Bereich und Etage werden auch aus dem **zugehörigen Gerät** übernommen, wenn die Entität selbst keinen Bereich besitzt
- Entitäten ohne geeignete Energie-Langzeitstatistiken werden unterhalb des Diagramms aufgelistet (z. B. reine Licht-Schalter)
- Konfiguration über den visuellen Karteneditor (GUI)
- Anzeige nicht zugeordneten Verbrauchs und Warnung bei möglicher Doppelzählung

## Installation über HACS

1. Das GitHub-Repository muss **öffentlich (Public)** sein. Bei einem privaten Repository zeigt der Marketplace bei der Eingabe des GitHub-Links **Not Found** an.
2. In Home Assistant **Einstellungen → Marketplace → Über einen GitHub-Link hinzufügen** öffnen.
3. Den Link `https://github.com/gbasedow/basedog_energy_card` eingeben und hinzufügen.
4. `basedog_energy_card` im Marketplace installieren und den Browser neu laden.
5. Im Dashboard die Karte mit Typ `custom:basedog-energy-card` verwenden.

Alternativ kann die Ressource `dist/basedog-energy-card.js` als JavaScript-Modul in Home Assistant eingebunden werden.

## Konfiguration

Alle Felder sind im visuellen Editor verfügbar. Beispiel-YAML:

```yaml
type: custom:basedog-energy-card
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

**Hinweis:** Die GitHub-Sichtbarkeit wird in den Repository-Einstellungen unter **Settings → General → Danger Zone → Change repository visibility → Public** geändert. Eine Veröffentlichung im offiziellen Marketplace-Katalog ist ein separater Schritt.

## Entwicklung

`npm run check` prüft die JavaScript-Syntax. Die lauffähige Datei liegt in `dist/basedog-energy-card.js`.

Lizenz: MIT.

## Version 0.2.0

Die Karte berücksichtigt Bereichszuordnungen von Geräten, erlaubt das Ein-/Ausschalten der drei Hierarchieebenen und zeigt nicht auswertbare Entitäten mit Begründung an. Nur Energie-Entitäten mit Langzeitstatistiken können als kWh-Verbrauch dargestellt werden; reine `light.*`-Entitäten haben in der Regel keine Verbrauchsstatistik.

## Version 0.3.0

Die Versionsnummer wird direkt oben im visuellen Karteneditor und in der Karte angezeigt. Zusätzlich wurde die veraltete manuell eingebundene JavaScript-Ressource aus der Home-Assistant-Instanz entfernt, damit die Marketplace-Version geladen werden kann. Nach dem Update den Browser-Cache hart aktualisieren (Strg+Umschalt+R) oder die Home-Assistant-App neu starten.

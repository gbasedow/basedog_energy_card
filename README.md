# basedog_sankey_card für Home Assistant

Eine Lovelace-Karte für die Visualisierung historischer Energieverbräuche als Sankey-Diagramm.

## Funktionen
- Zentrale Verbrauchsentität
- Auswahl zusätzlicher Energieentitäten und Home-Assistant-Label-IDs
- Zeitraum mit unabhängiger Dauer und Endzeitpunkt-Auswahl („Jetzt“ oder fest)
- Konfigurierbare Ebenen-Reihenfolge: Etage, Bereich, Entität
- Visueller Lovelace-Karteneditor (kein YAML erforderlich)
- Nicht zugeordneter Verbrauch und Warnung bei Überzählung

## Installation über HACS
1. Das Repository muss für die normale HACS-Installation öffentlich zugänglich sein. Aktuell ist es privat; deshalb vor der HACS-Installation die Sichtbarkeit prüfen.
2. In HACS → Frontend → ⋮ → Benutzerdefinierte Repositories die URL hinzufügen, Kategorie **Dashboard**.
3. „Basedog Sankey Card“ installieren und Home Assistant im Browser neu laden.
4. Dashboard bearbeiten → Karte hinzufügen → „Basedog Sankey Card“ auswählen.

Alternativ `dist/basedog-sankey-card.js` nach `/config/www/` kopieren und die Ressource `/local/basedog-sankey-card.js` als JavaScript-Modul hinzufügen.

## Beispiel
```yaml
type: custom:basedog-sankey-card
title: Energiefluss
entity: sensor.stromverbrauch_gesamt
entities:
  - sensor.kueche_energie
  - sensor.wohnzimmer_energie
labels:
  - energieverbrauch
levels:
  - floor
  - area
  - entity
duration: 24
duration_unit: hours
time_mode: now
height: 400
```

## Datenanforderungen und Grenzen
- Unterstützt kumulative Energiesensoren mit verfügbaren Home-Assistant-Langzeitstatistiken (`sum`) und Einheiten Wh/kWh/MWh/J/kJ/MJ.
- Die Verteilung wird anhand der ausgewählten Entitäten berechnet; es findet keine automatische Erkennung physischer Stromflüsse statt.
- Die Hauptentität muss den Gesamtverbrauch repräsentieren; Teilzähler dürfen sich nicht überschneiden, sonst entstehen Doppelzählungen.
- Labels beziehen sich auf Entity-Registry-Labels (IDs), nicht auf Label-Anzeigenamen. Bereich und Etage stammen aus der Entity- und Area-Registry.
- Die Diagrammstruktur ist eine erste Implementierung; eine visuelle Prüfung in der Zielversion von Home Assistant und Tests mit realen Statistikdaten stehen noch aus.
- Historische Statistikdaten können bei sehr kurzen oder nicht an Stunden ausgerichteten Zeiträumen unvollständig sein.

## Entwicklung
`npm run build` kopiert die dependencyfreie JavaScript-Datei nach `dist/`.

## Releases
Ein Tag `v0.1.0` startet den GitHub-Actions-Workflow, der `dist/basedog-sankey-card.js` an das GitHub-Release anhängt.

## Lizenz
MIT
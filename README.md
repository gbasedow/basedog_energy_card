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

## Version 0.4.0

Die Hierarchiespalten werden unabhängig von der Kartenbreite vollständig gerendert. Auf schmalen Bildschirmen kann horizontal gescrollt werden. Beim Überfahren eines Balkens oder Verbindungswegs mit der Maus erscheint ein Tooltip mit dem Namen und dem Energieverbrauch in kWh. Die Versionsnummer wird weiterhin im Karteneditor angezeigt.

## Version 0.5.0

Das Sankey-Diagramm wechselt bei einer Kartenbreite unter 700 CSS-Pixeln automatisch in eine vertikale Darstellung (oben nach unten); ab 700 Pixeln wird es horizontal (links nach rechts) dargestellt. Ein ResizeObserver reagiert auch auf Änderungen der Kartenbreite durch Bildschirmrotation. Die SVG-Grafik wird auf die Kartenbreite skaliert. Der neue Schalter **Beschriftungen im Diagramm anzeigen** im visuellen Editor steuert `show_labels` (Standard: `true`). Die Hover-Tooltips bleiben unabhängig von diesem Schalter verfügbar.

## Version 0.5.1

Die vertikale Smartphone-Darstellung nutzt nun eine schmale SVG-Zeichenfläche mit einer Höhe, die automatisch mit der Anzahl der Energie-Entitäten wächst. Jede Entität erhält eine eigene Zeile mit lesbarer Beschriftung; die vorherige starke Verkleinerung des Diagramms entfällt. Horizontale Ansicht, Tooltips und der Beschriftungsschalter bleiben erhalten.

## Version 0.6.0

Mobile Sankey-Ansicht: Neu angeordnete Hierarchie nach Vorfahren, vertikale Ebenen mit getrennten Zeilen für jeden Knoten, proportionale Balken und Flussverbindungen, vollständige Beschriftung mit kWh-Wert. Die Höhe wächst mit der Knotenzahl. Desktopansicht, Hover-Tooltips und der Beschriftungsschalter bleiben bestehen.

## Version 0.6.1

In der schmalen vertikalen Ansicht werden Energiepfade in voneinander getrennte Breitenintervalle aufgeteilt. Die Verbindungen verlaufen parallel ohne Überlagerung. Beschriftungen werden innerhalb des Balkens dargestellt, wenn sie bei mindestens 12 px Schriftgröße vollständig hineinpassen; andernfalls bleiben sie ausgeblendet und sind per Tooltip verfügbar.

## Version 0.7.0

Vertikale Ansicht: Geschwungene, gefüllte Sankey-Bänder mit separat zugewiesenen, nebeneinanderliegenden Startsegmenten pro Ebene. Jede Verbindung besitzt ihren eigenen Quell- und Zielbereich; die Reihenfolge bleibt hierarchisch. Beschriftungen werden nur angezeigt, wenn sie bei 12 px in den Balken passen. Horizontale Ansicht: Das Diagramm wird anhand der konfigurierten Dashboard-Rasterhöhe skaliert.

## Version 0.8.0

Korrektur des Sankey-Layouts: Getrennte Quellsegmente und geschwungene, gefüllte Verbindungen in beiden Ausrichtungen; Kinder erben proportionale Teilbereiche der Eltern. Neue Editoroption **Darstellung**: automatisch, immer vertikal oder immer horizontal. Die horizontale SVG wird an die konfigurierte Rasterhöhe angepasst, auch bei drei Zeilen. Die Version wird im Kartentitel angezeigt.

## Version 0.9.0

Sankey-Layout nach Analyse des nativen Home-Assistant-Frontend-Codes (`ha-sankey-chart.ts`, `sankey-layout.ts`, `sankey-path.ts`): gemeinsame Verbrauchsskala für alle Ebenen, eigene Ein- und Ausgangssegmente, 6px Knotenabstand, kubische Bézier-Bänder und hierarchische Sortierung. Beschriftungen erscheinen nur, wenn bei mindestens 10px effektiver Schriftgröße ausreichend Platz besteht; Tooltips bleiben immer verfügbar. Vertikale Ansicht nutzt die Kartenbreite, horizontale Ansicht die konfigurierten Rasterzeilen.

## Version 0.17.0

Optik an die native Home-Assistant-Karte angepasst: Standard-Kartenkopf (`ha-card`-Header-Schriftart und -größe), kein Versionsbadge und kein Aktualisieren-Button mehr im Kopf (die Version steht weiterhin im Karteneditor), Home-Assistant-Schriftart in den Diagrammbeschriftungen, keine Verzerrung des Diagramms mehr durch gestrecktes SVG, dezenter Hover-Effekt auf den Flussbändern. Die Zusammenfassungszeile steht jetzt unter dem Diagramm.

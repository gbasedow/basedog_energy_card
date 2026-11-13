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

Alle Felder sind im visuellen Editor verfügbar (Auswahldialoge von Home Assistant für Entitäten und Labels). Beispiel-YAML:

```yaml
type: custom:basedog-energy-card
title: Energiefluss
entity: sensor.gesamtenergie        # zentrale Energieentität (Gesamtverbrauch)
source: labels                      # energy | labels | entities
labels:                             # nur bei source: labels
  - stromverbrauch
# entities:                         # nur bei source: entities (nur Energie-Entitäten)
#   - sensor.kuehlschrank_energie
show_date_picker: true              # Datumsauswahl unten; ohne: immer heute
levels: [floor, area, entity]
orientation: auto                   # auto | vertical | horizontal
show_labels: true
show_values: false
group_below_kwh: 0.1                # kleine Werte zusammenfassen (0 = aus)
group_levels: 2                     # 1 = Entitäten, 2 = + Bereiche, 3 = + Etagen
```

- `source: energy` übernimmt die Geräte aus den Energie-Einstellungen (Energie-Dashboard). Untergeräte (`included_in_stat`) werden übersprungen, um Doppelzählung zu vermeiden.
- Dargestellt wird immer der Verbrauch eines Kalendertages (lokale Zeit), beim heutigen Tag bis jetzt.

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

## Version 0.18.0

Diagramm nach dem Vorbild der nativen Home-Assistant-Energiekarte (`ha-sankey-chart.ts`, ECharts-Sankey) neu aufgebaut: Knotenbreite 15 px, 6 px Knotenabstand, eine gemeinsame Skala für alle Spalten, Knoten oben gestapelt, Bänder mit 40 % Deckkraft und Farbverlauf, Beschriftungen in 12 px rechts neben dem Knoten (vertikale Ansicht: unterhalb, Schrift passt sich an) und ein einzelner grauer Knoten „Nicht erfasster Verbrauch". Etagen und Bereiche nutzen `--primary-color`, die Verbraucher die Theme-Farben `--graph-color-N`. Das Diagramm wird in echten Pixeln gezeichnet (Kartenhöhe wie nativ 400 px, vertikal 500 px). Die Zusammenfassungszeile entfällt. Neue Option `show_values` (Standard `false`, wie nativ) blendet kWh-Werte in den Beschriftungen ein.

## Version 0.19.0

Layout 1:1 nach dem eigenen Sankey-Layout der Home-Assistant-Frontend-Quellen (`sankey-layout.ts`, `sankey-path.ts`) umgebaut: Pass-through-Knoten (der Strang „Nicht erfasster Verbrauch" läuft durch jede Spalte), mittig verteilte Knoten („space-around"), globale Wert-zu-Pixel-Skala mit 1 px Mindestgröße, Spaltenabstand Breite/Spaltenzahl und Bänder mit konstanter Dicke. Die Karte füllt in Abschnitts-Dashboards wie die native Karte die Grid-Höhe (`getGridOptions`: 12 Spalten, 6 Zeilen), sonst 400 px (vertikal 500 px). Beschriftungen passen sich dem Knotenabstand an und überlappen nicht mehr.

## Version 0.19.1

Fix: In Dashboards mit sehr kleiner oder automatischer Kartenhöhe (Abschnittsansicht) wurde in 0.19.0 nur der Titel angezeigt, weil der Diagrammbereich die Höhe 0 hatte. Der Diagrammbereich hat jetzt eine Mindesthöhe von 200 px (Grid-Karte mindestens 300 px).

## Version 0.20.0

Die komplette Kartenfläche wird genutzt: Horizontal reicht die letzte Spalte inklusive Beschriftung bis an den rechten Rand, vertikal die letzte Reihe bis an den unteren Rand. Der Platz für die letzten Beschriftungen wird gemessen statt pauschal reserviert, alle Spalten bzw. Reihen werden gleichmäßig bis dorthin verteilt.

## Version 0.20.1

Fix: Die berechnete Schriftverkleinerung der Beschriftungen wurde durch eine CSS-Regel überschrieben, alle Texte erschienen immer in 12 px. Dadurch überlappten sich Beschriftungen und ragten über den Rand. Außerdem reserviert die Karte rechts jetzt nur die Breite, die die (verkleinerten) Beschriftungen tatsächlich brauchen, sodass das Diagramm die volle Breite nutzt. Canvas-Messung und Darstellung nutzen dieselbe Schriftliste (`Roboto, Noto, sans-serif`).

## Version 0.21.0

Die Karte füllt in Abschnitts-Dashboards die komplette Grid-Zelle (der Host übernimmt die Zellenhöhe). Der Diagrammbereich wird per ResizeObserver beobachtet: Wenn Home Assistant die Zelle nach dem ersten Rendern vergrößert oder verkleinert (Grid-Layout, Bearbeitungsmodus, Fenstergröße), wird das Diagramm mit den neuen Maßen neu gezeichnet. Vorher blieb das SVG auf der alten Größe und wurde verkleinert und zentriert dargestellt, sodass links und rechts Platz frei blieb.

## Version 0.22.0

- Quelle der Verbraucher wählbar: **Energie-Dashboard**, **Labels** oder **Entitäten**. Labels und Entitäten werden mit den Auswahldialogen von Home Assistant gewählt, Entitäten nur aus Energie-Sensoren. Bestehende Konfigurationen werden automatisch übernommen (nur Labels → Modus Labels).
- Immer Tagesverbrauch. Optional eine kleine Datumsleiste unten (Datum, „Heute“, vorheriger/nächster Tag). Ohne Leiste wird immer der heutige Tag angezeigt. Die Optionen Dauer/Einheit/Bezugszeitpunkt entfallen.
- Tagesenergie aus der Summe der stündlichen Änderungen (vorher fehlte die erste Stunde), Umrechnung nach kWh durch Home Assistant.
- Kleine Werte können über 1 bis 3 Ebenen zusammengefasst werden (`group_levels`).
- Editor auf Basis von `ha-form` neu aufgebaut.

## Version 0.23.0

- Schwellwert für das Zusammenfassen akzeptiert beliebige Dezimalzahlen (z. B. 0,05 kWh).
- Die Liste „Entitäten ohne auswertbare Energie-Statistiken“ lässt sich aufklappen und bleibt beim minütlichen Aktualisieren offen; sie zeigt Name und Entitäts-ID und ist scrollbar.
- Sehr kleine Flüsse (z. B. „Speicher“) werden wie die Knoten mit mindestens 1 px gezeichnet, die Linie ist dadurch durchgehend.
- Schalter „Beschriftung anzeigen“ und „Energiewerte (kWh) anzeigen“ stehen im Editor direkt unter der Quellauswahl. Passen Name und Wert nicht zweizeilig, wird „Name · Wert“ einzeilig versucht.

## Version 0.24.0

- Datumsleiste: Datum, „Heute“ und die Pfeile stehen rechtsbündig nebeneinander.
- Neue Option „Zusammenfassen nach“: **Wert (Schwelle)** wie bisher oder **Top N** (`group_mode: top`, `top_n: 10`). Bei Top N bleiben die N größten Verbraucher mit Etage/Bereich erhalten, alle übrigen werden zu einem Knoten „Zusammengefasst (k)“ gebündelt.

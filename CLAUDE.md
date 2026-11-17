# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Worum es geht

`basedog_energy_card` ist eine Lovelace-Karte für Home Assistant (`type: custom:basedog-energy-card`). Sie zeigt den Energieverbrauch eines Tages als Sankey-Diagramm mit der Hierarchie Gesamtzähler → Stockwerk → Bereich → Entität und ist der nativen HA-Energie-Sankey-Karte nachempfunden. Verteilt wird sie über HACS. Benutzerdoku und Changelog stehen auf Deutsch in `README.md`, alle UI-Texte sind ebenfalls deutsch.

## Befehle

- `npm run check`: führt `node --check dist/basedog-energy-card.js` aus, also nur eine Syntaxprüfung. Build-Schritt, Bundler, Linter oder Testsuite gibt es im Repo nicht.
- Die ausgelieferte Datei `dist/basedog-energy-card.js` ist handgeschrieben und wird direkt bearbeitet.

## Versionierung und Release

Die Versionsnummer steht an vier Stellen und muss überall gemeinsam angehoben werden:
- `VERSION`
- `package.json`
- `dist/basedog-energy-card.js`, dort im Kopfkommentar und in `CARD_VERSION`

Jedes Release bekommt in der README einen neuen Abschnitt `## Version x.y.z`.

`.github/workflows/release.yml` läuft bei jedem Push, der `VERSION` ändert. Der Workflow legt das GitHub-Release `v${VERSION}` mit `dist/basedog-energy-card.js` als Asset an. Gibt es das Release schon, lädt er die Datei neu hoch. HACS installiert aus diesen Releases (`hacs.json`: `filename: basedog-energy-card.js`, `content_in_root: false`). Da der Workflow schon beim Push des Feature-Branches auslöst, entsteht das Release meist bereits vor dem Merge des PR.

Installation auf der HA-Instanz des Nutzers über die Home-Assistant-MCP-Tools:
1. Mit `ha_manage_hacs` erst `update_information`, dann `download` für `gbasedow/basedog_energy_card` mit Version `vX.Y.Z` ausführen.
2. Prüfen, dass die URL der Dashboard-Ressource auf `?v=…-vX.Y.Z` endet.

Meldet `download` „is being installed“, hat HACS das Update schon von selbst gestartet.

## Architektur (`dist/basedog-energy-card.js`)

Die Datei definiert zwei einfache `HTMLElement`s ohne Lit, jeweils mit Shadow Root, dazu eine Konfigurationsschicht.

**Konfiguration**
- `normalize()` ist die einzige Quelle für die Konfiguration. Sie setzt Standardwerte und migriert alte Konfigurationen:
  - entfernt `duration`, `time_mode` und die übrigen Schlüssel aus `LEGACY`
  - leitet `source` daraus ab, ob `labels` oder `entities` gesetzt ist
  - macht aus der alten `levels`-Liste die Einstellung `detail`
  - behält `labels` bzw. `entities` nur bei passender `source`
- Karte und Editor laufen beide über `normalize()`.

**`BasedogEnergyCard`**
- `load()` holt die Daten für den gewählten Tag: ab lokaler Mitternacht bis Tagesende, beim heutigen Tag bis jetzt.
  - Registries: Entity-, Device-, Area- und Floor-Registry.
  - Verbraucher je nach `source`:
    - `energy`: `energy/get_prefs` → `device_consumption`, Untergeräte mit `included_in_stat` werden übersprungen
    - `labels`: Label-Treffer an der Entität oder an ihrem Gerät
    - `entities`: die explizite Liste
  - Filter: Nur Verbraucher, die Energie-Statistiken sind, bleiben drin (`recorder/get_statistics_metadata`, `unit_class: energy`).
  - Werte: aus `recorder/statistics_during_period` mit `period: hour` und `units: {energy: "kWh"}`. Der Tageswert ist die Summe der stündlichen `change`-Werte. Die Differenz der `sum`-Werte dient nur als Rückfall, weil ihr die erste Stunde fehlt.
  - Bereich und Stockwerk kommen von der Entität, ersatzweise vom Bereich des Geräts.
- `diagram()` baut den Knotenbaum und das SVG.
  - **Baum:** Knoten sind die Wurzel, darunter `detailLevels(detail)` (kumulativ: Stockwerk / Stockwerk+Bereich / alle drei), dazu ein grauer Knoten „Nicht erfasster Verbrauch“.
  - **Zusammenfassen:** Es gibt zwei Modi.
    - `group_mode: value`: Von unten nach oben über `group_levels` werden Kinder unter `group_below_kwh` je Elternknoten zu einem Knoten „Zusammengefasst (n)“ gebündelt.
    - `group_mode: top`: Die `top_n` größten Entitäten bleiben, der Rest wird zu einer Gruppe direkt an der Wurzel.
    - In beiden Modi stehen die Gruppenknoten in der letzten Spalte.
  - **Layout:** Es ist aus HAs eigenem `sankey-layout.ts` bzw. `sankey-path.ts` portiert (`home-assistant/frontend`, `src/resources/echarts/components/sankey/`), nicht aus dem Standardlayout von ECharts.
    - Verbindungen über mehrere Spalten erzeugen in jeder Zwischenspalte Pass-through-Knoten.
    - Knoten werden in jeder Spalte per `space-around` verteilt, mit einem globalen Verhältnis Wert→Pixel und mindestens 1 px Größe. Auch Verbindungen sind mindestens 1 px dick.
    - Die Spalten verteilen sich gleichmäßig bis zu der Breite, die die Beschriftungen der letzten Spalte wirklich brauchen. Diese Breite wird per Canvas gemessen, mit derselben Schriftliste wie im SVG.
    - Die Konstanten entsprechen der nativen Karte: Knoten 15 px, Abstand 6 px, Schrift 12 px, Deckkraft der Verbindungen 0,4, Krümmung 0,5.
  - **Schriftgröße:** Sie wird pro `<text>` als Attribut gesetzt. Kein `font-size` für `svg text` per CSS setzen, sonst werden die angepassten Größen überschrieben.
- `render()` und Größe:
  - Das SVG wird in echten Pixeln für die gemessene `.chart`-Box (`chartW`/`chartH`) gezeichnet.
  - Ein `ResizeObserver` auf `.chart` zeichnet neu, sobald HA die Grid-Zelle verändert.
  - `:host{height:100%}` und `ha-card.is-grid{height:100%}` sorgen dafür, dass die Karte Zellen der Abschnittsansicht ausfüllt. `getGridOptions()` liefert 12×6.
  - Alles wird per `innerHTML` neu gerendert. Zustand, der ein Neuzeichnen überstehen muss, liegt deshalb an der Instanz und wird ins Markup zurückgeschrieben: das Detail-Dropdown (`_detail`), der Tag (`_day`) und der Aufklappzustand der Liste fehlender Entitäten (`_missingOpen`).
- Untere Leiste (`dateBar()` / `bindDateBar()`):
  - Sie wird immer angezeigt und enthält das `<select>` für die Detailtiefe.
  - Bei `show_date_picker` kommen der Datumsknopf (verstecktes `<input type="date">` mit `showPicker()`), „Heute“ sowie die Knöpfe für vorherigen und nächsten Tag hinzu.
  - Ohne Datumsauswahl zeigt die Karte immer den heutigen Tag.

**`BasedogEnergyEditor`**
- Er rendert HAs `ha-form` mit dem Schema aus `editorSchema(config)`. Das Schema ist dynamisch: Label- und Entitäts-Auswahl erscheinen nur bei passender `source`, Schwellwert-Felder oder `top_n` nur beim passenden `group_mode`.
- HA lädt `ha-form` erst bei Bedarf. `ensureForm()` erzwingt das Laden, indem es über `loadCardHelpers()` einen eingebauten Karteneditor erzeugt.

## Hinweise zum Testen

Ein Testgerüst ist nicht im Repo. Änderungen wurden bisher geprüft, indem `dist/basedog-energy-card.js` in Headless-Chromium (Playwright) geladen wurde, mit:
- einem Ersatz für das Element `ha-card` (Shadow Root mit `<slot>`, `display:flex` als Spalte) und einem Ersatz für `ha-icon`
- einem gemockten `hass.callWS`, das Registries, `energy/get_prefs`, Statistik-Metadaten und Statistiken liefert

Das Mock-Rendering bildet die Grid-Größen des echten Dashboards nicht nach. Layout-Änderungen deshalb zusätzlich in einem Container testen, dessen Größe sich nach dem ersten Rendern ändert, und am Ende vom Nutzer auf dem echten Dashboard prüfen lassen.

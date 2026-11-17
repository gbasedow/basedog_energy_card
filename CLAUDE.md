# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`basedog_energy_card` is a Home Assistant Lovelace custom card (`type: custom:basedog-energy-card`). It shows one day's energy consumption as a Sankey diagram with the hierarchy total meter → floor → area → entity, styled after the native HA energy Sankey card. It is distributed through HACS. The user-facing docs and changelog are in `README.md`, which is written in German, and all UI strings are German too.

## Commands

- `npm run check`: runs `node --check dist/basedog-energy-card.js` (syntax check only). There is no build step, bundler, linter or test suite in the repo.
- The runnable artifact is the hand-written file `dist/basedog-energy-card.js`. Edit it directly.

## Versioning and release

The version string lives in four places and must be bumped together:
- `VERSION`
- `package.json`
- `dist/basedog-energy-card.js` (header comment and `CARD_VERSION`)

The README gets a new `## Version x.y.z` section for each release.

`.github/workflows/release.yml` runs on any push that changes `VERSION`. It creates the GitHub release `v${VERSION}` with `dist/basedog-energy-card.js` attached, or re-uploads the asset if the release already exists. HACS installs from these releases (`hacs.json`: `filename: basedog-energy-card.js`, `content_in_root: false`). Because the workflow triggers on the branch push as well, a release is usually created from the feature branch before the PR is merged.

To deploy to the user's HA instance (Home Assistant MCP tools):
1. Run `ha_manage_hacs` with `update_information` and then `download` for `gbasedow/basedog_energy_card` with version `vX.Y.Z`.
2. Check that the dashboard resource URL ends in `?v=…-vX.Y.Z`.

If `download` reports "is being installed", HACS has already started the update on its own.

## Architecture (`dist/basedog-energy-card.js`)

The file defines two plain `HTMLElement`s (no Lit), each with a shadow root, plus a config layer.

**Config**
- `normalize()` is the single source of truth for config. It fills defaults and migrates old configs:
  - drops `duration`, `time_mode` and the other keys listed in `LEGACY`
  - infers `source` from whether `labels` or `entities` is set
  - turns the old `levels` list into `detail`
  - keeps `labels` or `entities` only for the matching `source`
- Both the card and the editor go through `normalize()`.

**`BasedogEnergyCard`**
- `load()`: fetches the data for the selected day (local midnight until the end of the day, or until now for today).
  - Registries: entity, device, area and floor registry.
  - Consumers, depending on `source`:
    - `energy`: `energy/get_prefs` → `device_consumption`, skipping `included_in_stat` sub-devices
    - `labels`: label match on the entity or its device
    - `entities`: the explicit list
  - Filtering: consumers are kept only if they are energy statistics (`recorder/get_statistics_metadata`, `unit_class: energy`).
  - Values: summed from `recorder/statistics_during_period` (`period: hour`, `units: {energy: "kWh"}`). The day value is the sum of hourly `change` values; the difference of `sum` values is only a fallback, because it would drop the first hour.
  - Area and floor: taken from the entity, with the device's area as fallback.
- `diagram()`: builds the node tree and the SVG.
  - **Tree.** Nodes are root → `detailLevels(detail)` (cumulative: floor / floor+area / all three), plus one gray "Nicht erfasster Verbrauch" node.
  - **Grouping.** Two modes:
    - `group_mode: value`: bottom-up over `group_levels`, children below `group_below_kwh` are folded into one "Zusammengefasst (n)" node per parent.
    - `group_mode: top`: keeps the `top_n` largest entities and puts the rest in one group off the root.
    - In both modes the group nodes sit in the last column.
  - **Layout.** This is a port of HA's own `sankey-layout.ts` / `sankey-path.ts` from `home-assistant/frontend` (`src/resources/echarts/components/sankey/`), not ECharts' default layout:
    - Links that span several columns create pass-through nodes in each intermediate column.
    - Nodes are spread `space-around` in every column, using one global value→pixel ratio with a 1px minimum (links also have a 1px minimum).
    - Columns are spaced evenly up to the width the last column's labels actually need. That width is measured with a canvas using the same font list as the SVG.
    - Constants match the native card: node 15px, gap 6px, font 12px, link opacity 0.4, curveness 0.5.
  - **Text sizing.** Label `font-size` is set per `<text>` attribute. Do not set `font-size` on `svg text` in CSS, because it overrides the fitted sizes.
- `render()` and sizing:
  - The SVG is drawn in real pixels for the measured `.chart` box (`chartW`/`chartH`).
  - A `ResizeObserver` on `.chart` re-renders whenever HA resizes the grid cell.
  - `:host{height:100%}` together with `ha-card.is-grid{height:100%}` makes the card fill sections-view cells. `getGridOptions()` is 12×6.
  - Everything is re-rendered with `innerHTML`, so UI state that must survive re-renders is kept on the instance and restored in the markup: the detail dropdown (`_detail`), the day (`_day`) and the open state of the missing-entities `<details>` (`_missingOpen`).
- Bottom bar (`dateBar()` / `bindDateBar()`):
  - It is always shown and contains the detail-depth `<select>`.
  - When `show_date_picker` is on, it also shows the date button (hidden `<input type="date">` + `showPicker()`), "Heute" and prev/next buttons.
  - With the picker off, the card always shows today.

**`BasedogEnergyEditor`**
- It renders HA's `ha-form` with the schema from `editorSchema(config)`. The schema is dynamic: label and entity selectors appear only for the matching `source`, and the threshold fields or `top_n` only for the matching `group_mode`.
- `ha-form` is lazy-loaded by HA, so `ensureForm()` forces it to load by creating a built-in card editor through `loadCardHelpers()`.

## Testing notes

There is no committed test harness. Changes so far were checked by loading `dist/basedog-energy-card.js` in headless Chromium (Playwright) with:
- a stub `ha-card` element (shadow root + `<slot>`, `display:flex` column) and a stub `ha-icon`
- a mocked `hass.callWS` returning registry, `energy/get_prefs`, statistics-metadata and statistics responses

Mock rendering does not reproduce the real dashboard's grid sizing, so layout changes should also be checked in a container whose size changes after the first render, and finally by the user on their dashboard.

# Browser store artwork

Production PNGs are in [`final/`](final/). Editable masters are in [`source/`](source/);
the screenshots and icon exports are generated from the unmodified v1.6.0 UI and SVG by
[`scripts/generate-store-artwork.mjs`](../scripts/generate-store-artwork.mjs). The root
`images/` directory remains reserved for README screenshots and browser-store badges.

## Store icons

| Store          | File                 | Dimensions | Use                     |
| -------------- | -------------------- | ---------: | ----------------------- |
| Chrome         | `final/icon-128.png` |    128x128 | Required extension icon |
| Firefox        | `final/icon-128.png` |    128x128 | Add-on listing icon     |
| Microsoft Edge | `final/icon-300.png` |    300x300 | Recommended store logo  |

[`source/icon.svg`](source/icon.svg) is the editable vector master. The README renders the
shared 128x128 asset at a smaller display size.

## Dashboard upload order

| Order | File                              | Dimensions | View                               | Reusable caption                             | Existing locale key(s)                                          |
| ----: | --------------------------------- | ---------: | ---------------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
|     1 | `01-light-counter.png`            |   1280x800 | Light age counter                  | Your age, counting up live on every new tab. | `setupSubtitle`                                                 |
|     2 | `02-life-in-weeks.png`            |   1280x800 | Blueprint life-in-weeks view       | Life in weeks                                | `lifeInWeeks`                                                   |
|     3 | `03-next-birthday.png`            |   1280x800 | Paper next-birthday counter        | Next birthday                                | `modeBirthday`                                                  |
|     4 | `04-settings-personalization.png` |   1280x800 | Blueprint personalization controls | Settings - Presets, Colors, Display          | `settings`, `sectionPresets`, `sectionColors`, `sectionDisplay` |
|     5 | `05-dark-counter.png`             |   1280x800 | Dark age counter                   | Age - Dark                                   | `modeYears`, `presetDark`                                       |

Use the listed keys from `src/_locales/<locale>/messages.json` when a dashboard supports
localized captions. They keep captions aligned with the extension's shipped terminology.

## Promotional images

| File                          | Dimensions | Use                                           |
| ----------------------------- | ---------: | --------------------------------------------- |
| `small-promo-440x280.png`     |    440x280 | Chrome Web Store small promo tile             |
| `marquee-1400x560.png`        |   1400x560 | Chrome Web Store marquee / featured placement |
| `social-preview-1200x630.png` |   1200x630 | GitHub Pages Open Graph and social share card |

All three are full-bleed Blueprint compositions. The counter remains the primary mark,
the life ring stays subordinate, and `#007ea6` is reserved for the single live point.

## Synthetic capture profile

The screenshots contain no personal data. They use a fixed sample birth instant
(`1990-04-18 06:30 UTC`), no sex-at-birth value, a custom 82-year expectancy, English,
and a fixed capture time (`2026-07-12 12:00 UTC`). Device sync is unavailable in the
local preview. The deterministic clock keeps every regeneration identical.

## Regenerate

1. Install Chrome, Edge, or Chromium, or set `CHROME_BIN` to its executable.
2. Run `npm ci`.
3. Start the real extension preview with `npm run dev`.
4. In another terminal, run `node scripts/generate-store-artwork.mjs`.

Set `PREVIEW_URL` if the preview selects another port, or `CHROME_BIN` to use a specific
Chrome/Edge executable. The generator captures screenshots at device scale 1 without
resizing, rasterizes the SVG icon at each target size, asserts every PNG's exact
dimensions, and checks the screenshot and promo palettes against the WCAG contrast
thresholds in `DESIGN.md`.

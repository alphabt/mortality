# Copilot instructions — Mortality

Mortality is a zero-dependency browser extension (Chrome / Firefox / Edge, MV3) that
replaces the new tab page with a live counter of your age. There is **no build step**: the
files in [`src/`](../src) _are_ the extension (vanilla ES modules, plain CSS, HTML).

## Development and validation

- Full test suite: `npm test`.
- Focused test file: `npx vitest run test/<file>.test.js`.
- Formatting gate: `npm run format:check`; use `npm run format` to apply fixes.
- Package gate: `npm run zip`.
- There is no build or lint script. Do not probe generic build/lint commands or pass
  Jest-only flags such as `--runInBand` to Vitest.

## Design Context

This project uses the **impeccable** design skill. Before changing any UI, read the two
root context files — they are the source of truth for how Mortality should look and feel:

- **[PRODUCT.md](../PRODUCT.md)** — strategy: register, users, purpose, brand personality,
  anti-references, design principles, accessibility bar.
- **[DESIGN.md](../DESIGN.md)** — visual system: color/type/spacing tokens and the six-section
  spec (Overview, Colors, Typography, Elevation, Components, Do's & Don'ts).

Quick reference:

- **Register:** product (a tool; design serves the task).
- **North Star:** _"The Quiet Instrument"_ — read at a glance like a fine watch face.
- **Principles:** calm over alarm · the number is the product · disappear into the glance ·
  honest, not morbid · respect the user's canvas.
- **Never:** gamified streaks, productivity-dashboard widgets, morbid skull/tombstone kitsch,
  cutesy emoji playfulness, `box-shadow`/cards/glassmorphism, gradient text, `border-left`
  accent stripes, or an uppercase eyebrow on every element.
- **Always:** accent (`#007ea6`) marks one live point only · `tabular-nums` on ticking
  figures · contrast-checked themes (count/label ≥ 4.5:1 on bg, accent ≥ 3:1) · a
  `prefers-reduced-motion` path for every animation · **WCAG 2.1 AA**.

To iterate visually, run `/impeccable live` (pre-configured for `src/tab.html`).

## Workflow

### Preview and browser verification

- For the normal preview, use `npm run dev`, which starts
  [`scripts/preview.mjs`](../scripts/preview.mjs). The app's **Run** button is configured by
  [`.github/copilot-desktop.yml`](copilot-desktop.yml) to invoke that npm command and open
  its URL. Do not create an ad hoc server or mutate Copilot app settings/database state.
- When starting the preview through a tool, keep it running as a detached process, wait for
  the printed `Mortality preview ready at ...` URL, verify it responds, then open that URL
  in the integrated browser. If the panel is blank or stale, restart the preview or use a
  cache-busting URL before diagnosing the extension code.
- Always let the user try UI changes in the integrated browser before finalizing them. The
  shipping engines are Chrome/Edge (Chromium) and Firefox (Gecko), however, so reproduce
  rendering, caching, or keyboard behavior in a target browser before adding a workaround.
  Do not complicate the extension for behavior caused only by the app preview or by a
  shortcut captured by its host UI.

### Stacked pull requests

- Before acting on or pushing a layer, run `git fetch origin --prune` and inspect the live
  base PR, branch head, and merge state. A SHA supplied at kickoff is a snapshot, not a
  durable source of truth; live remote state wins over stale cross-session messages.
- Keep each PR limited to its layer's delta. Do not duplicate, revert, or silently modify
  lower-layer behavior.
- If a lower PR is squash-merged and its branch is deleted, replay only the current layer's
  commits onto the merged `origin/main`, verify the resulting layer-only diff, and retarget
  as needed. Do not recreate the deleted branch or retain an empty/no-content bridge commit.
- Do not restack for every transient review commit. Unless the upper layer is blocked, wait
  for the dependency's checks and review to settle, then send dependent sessions one
  consolidated update containing only material base or API changes.

### Pull requests

- **Pull requests:** describe UI changes in words in the PR description — do **not** commit
  image files or park them on a throwaway asset branch just to embed screenshots from the
  CLI; never do that. If a reviewer wants visual proof, attach screenshots by hand via
  drag-and-drop in the GitHub web UI.

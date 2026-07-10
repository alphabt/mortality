# Copilot instructions — Mortality

Mortality is a zero-dependency browser extension (Chrome / Firefox / Edge, MV3) that
replaces the new tab page with a live counter of your age. There is **no build step**: the
files in [`src/`](../src) _are_ the extension (vanilla ES modules, plain CSS, HTML).

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

- **UI changes:** always open the integrated browser (preview `src/tab.html`, or the dev
  server) so the change can be tried out live before it's finalized.
- **Pull requests:** describe UI changes in words in the PR description — do **not** embed
  screenshots. GitHub's attachment CDN can't be reached from the CLI, so screenshots would
  otherwise require committing image files or parking them on a throwaway asset branch;
  never do that. If a reviewer wants visual proof, attach it by hand via drag-and-drop in
  the browser.

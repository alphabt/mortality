---
name: Mortality
description: A live counter of your age, read at a glance on every new tab.
colors:
  accent: "#007ea6"
  accent-focus: "#005f80"
  accent-dark: "#5cc2ea"
  ink: "#494949"
  ink-dark: "#b0b5b9"
  muted: "#6f747a"
  muted-dark: "#898f97"
  bg: "#ffffff"
  bg-dark: "#222222"
  surface-dark: "#2b2b2b"
  border: "#8b9096"
  border-dark: "#6b7176"
  on-accent: "#ffffff"
typography:
  display:
    fontFamily: "Avenir, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "clamp(2.75rem, 13vw, 6rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "normal"
    fontFeature: "'tnum' 1"
  title:
    fontFamily: "Avenir, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
  label:
    fontFamily: "Avenir, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.18em"
  caption:
    fontFamily: "Avenir, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.1em"
  mono:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "0.4em"
    fontWeight: 500
    letterSpacing: "0.01em"
  numeral-grotesk:
    fontFamily: "'Avenir Next', 'Helvetica Neue', Arial, sans-serif"
    fontWeight: 600
    fontFeature: "'tnum' 1"
rounded:
  2xs: "1px"
  xs: "2px"
  sm: "0.25rem"
  md: "0.4rem"
  lg: "0.5rem"
  full: "999px"
spacing:
  xs: "0.35rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "0.375rem 0.75rem"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "0.375rem 0.75rem"
  input-field:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.375rem 0.75rem"
  gear:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.lg}"
    size: "2.75rem"
  preset-swatch:
    rounded: "{rounded.md}"
    height: "2.25rem"
    width: "3.25rem"
  counter:
    textColor: "{colors.ink}"
    typography: "{typography.display}"
    rounded: "{rounded.lg}"
---

# Design System: Mortality

## 1. Overview

**Creative North Star: "The Quiet Instrument"**

Mortality is read the way you read a fine watch face or a well-made gauge: in half a
second, without effort, and without being asked to do anything. The whole system is built
around a single precise reading — your age, ticking — set in a large, still, tabular
number and given room to breathe. Everything else on the canvas is a subordinate marking
on the dial: a quiet label above, a hairline life-elapsed meter below, the born date and
percentage as fine print. The instrument is honest first; it states the figure and trusts
the number to carry the weight.

The surface is deliberately empty. An editorial lower-left composition leaves most of the
new tab as open space, and depth comes not from shadows or cards but from a single
time-of-day ambient glow that drifts across the background with the real hour — the light
in the room, not a UI chrome. Personalization (four-color themes, seven curated presets,
adjustable life expectancy) lets the instrument be re-cased without changing what it is.

This system explicitly rejects the loud grammar of productivity software. No gamified
streaks or rewards. No widget-grid dashboards. No morbid memento-mori kitsch — no skulls,
tombstones, or hourglasses. No cutesy, emoji-forward playfulness. Gravity is achieved
through restraint and arithmetic, never through props.

**Key Characteristics:**

- One reading, given room — the number is the product; everything else is a dial marking.
- Editorial stillness — lower-left composition, generous negative space, no cards.
- Ambient depth, not shadows — a single time-of-day glow is the only atmosphere.
- Precision typography — tabular figures, a monospace fraction, a single accent point.
- Calm, contrast-checked color that recolors cleanly across light, dark, and seven presets.

## 2. Colors

A near-monochrome instrument face carrying one cool accent, tuned so text stays legible in
both light and dark and across every user preset.

### Primary

- **Instrument Teal** (`#007ea6`): The single accent, used with intent and rarity — the
  "now" separator dot in the counter, the life-elapsed progress fill, primary buttons, and
  as the darkened focus tone (`#005f80`, light) / brightened tone (`#5cc2ea`, dark). It is
  never decoration; it always marks the live point or the primary action.

### Neutral

- **Reading Ink** (`#494949` light / `#b0b5b9` dark): The counter and all primary figures.
  The one high-contrast element on the face.
- **Dial Muted** (`#6f747a` light / `#898f97` dark): Labels, born date, percentage, the
  meter track, and the settings gear at rest — everything that is context, not reading.
- **Canvas** (`#ffffff` light / `#222222` dark): The background. Painted inline in
  `tab.html` before the stylesheet loads so dark mode never flashes white.
- **Field Surface** (`#2b2b2b`, dark only): Date/time/number input backgrounds in dark mode.
- **Hairline** (`#8b9096` light / `#6b7176` dark): Input and preset borders.
- **On-Accent** (`#ffffff`): Text/icon on top of an accent fill; in code it is _derived_
  per-theme via `bestOnColor()` so any user-picked accent keeps a legible label.

### Presets (full alternate cases)

Seven contrast-checked themes ship in `store.js`, each setting bg / label / count / accent
together. Five are full alternate cases: **Paper** (`#fafaf8` / oxblood `#b23a2e`),
**Void** (`#0a0a0a` / sky `#5cc2ea`), **Terminal** (`#0a0f0a` / green `#4ee08a`),
**Blueprint** (`#0e1b2a` / blue `#5a9be0`), **Amber** (`#1a1512` / amber `#e0a24e`). Two
more — **Light** (`#ffffff` / `#007ea6`) and **Dark** (`#222222` / `#007ea6`) — mirror the
stylesheet defaults so the shipped light and dark looks are selectable presets, giving
people a one-tap way back to the baseline.

### Named Rules

**The One Point Rule.** The accent marks exactly one thing at a time on the counter screen
— the live "now" dot and the elapsed fill are the same idea. It is never spent on borders,
labels, or fills-for-flavor. Its scarcity is what makes it read as "the point."

**The Earned-Contrast Rule.** Count and label must clear 4.5:1 on the background and accent
must clear 3:1 — for the defaults, every preset, _and any color the user picks_. Contrast
is validated in code (`store.js`), not assumed.

## 3. Typography

**Display / Body Font:** Avenir (with Helvetica Neue, Helvetica, Arial, sans-serif)
**Label / Mono Font:** system monospace (SF Mono, Menlo, Consolas)

**Character:** One humanist sans carries the entire interface — reading, labels, controls —
so nothing competes with the number. The only pairing is a deliberate contrast axis: a
small monospace fraction trailing the display figure, which reads as an instrument's fine
sub-scale rather than a second typeface.

### Hierarchy

- **Display** (600, `clamp(2.75rem, 13vw, 6rem)`, line-height 1): The counter. `tabular-nums`
  - `font-feature-settings: "tnum" 1` so digits never shift width as they tick.
- **Mono fraction** (500, `0.4em` of the display, raised `vertical-align: 0.82em`): The
  fractional years, masked with a left-to-right fade so the least-significant digits recede.
- **Title** (600, `1.4rem`, line-height 1.25, `text-wrap: balance`): Setup and Settings
  screen headings ("When were you born?", "Settings").
- **Label** (400, `1rem`, `letter-spacing: 0.18em`, UPPERCASE, line-height 1): The single
  eyebrow above the number ("AGE" / "DAYS LIVED" / "WEEKS LEFT").
- **Caption** (400, `0.72rem`, `letter-spacing: 0.1em`, UPPERCASE): The meta row (born date,
  percentage) and settings section labels.

### Numeral Typeface (user-selectable)

The big count offers three numeral typefaces, chosen in Settings and applied as an inline
`--num-font` custom property by `applyTypeface()` in `store.js` (`TYPEFACES = ["system",
"grotesk", "mono"]`). All three keep `tabular-nums` + `"tnum" 1`, and only the figures
change — the rest of the interface always stays on the display sans.

- **System** (default): clears `--num-font`, so the number inherits the display face
  (Avenir). The quietest option; the count matches the labels around it.
- **Grotesk**: `'Avenir Next', 'Helvetica Neue', Arial, sans-serif` — a slightly more
  geometric grotesque for the figures only.
- **Mono**: `ui-monospace, 'SF Mono', Menlo, Consolas, monospace` — the same monospace as
  the fraction sub-scale, turning the whole reading into an instrument-panel readout.

### Named Rules

**The Tabular Rule.** Any figure that updates in place is `tabular-nums`. A number that
jitters as it ticks breaks the illusion of an instrument.

## 4. Elevation

Flat by doctrine. There are **no `box-shadow`s anywhere** in the system — no cards, no
raised surfaces, no glass. Depth is conveyed by two means only: (1) tonal layering (muted
context recedes, ink reading advances), and (2) a single full-viewport **ambient glow**
rendered on a `<canvas>` whose hue, position, and intensity drift with the real hour of the
day. The glow is dithered in code to stay ring-free at 8-bit and kept at very low opacity
(≈0.05) so it never competes with the number. It is atmosphere, not a component.

### Named Rules

**The No-Chrome Rule.** Surfaces never lift off the canvas. If something needs to feel
present, raise its contrast or let the ambient light fall on it — do not add a shadow or a
card.

## 5. Components

Every interactive control is quiet at rest and confirms with a small, fast state change —
never a bounce, never a glow-for-flavor.

### Buttons

- **Shape:** Softly rounded (`0.25rem`).
- **Primary:** Accent background (`#007ea6`), on-accent text (derived for legibility),
  no border, padding `0.375rem 0.75rem`. Font inherits at `1.5rem`.
- **Hover / Active:** `filter: brightness(1.08)` on hover, `0.92` on active — a lightness
  nudge, not a color change. `transition: filter 0.15s ease`.
- **Secondary (`.btn-secondary`):** Transparent fill, muted text, `1px` hairline border;
  on hover the text and border shift to ink.
- **Focus:** `2px solid` focus tone, `2px` offset, `:focus-visible` only.

### Inputs / Fields

- **Style:** `1px` hairline border, canvas/field background, `0.25rem` radius. Date, time,
  number, color, and language inputs share one vocabulary. `appearance: none`.
- **Focus:** `2px solid` focus tone, `2px` offset.

### Preset Swatch

- A `3.25 × 2.25rem` rounded (`0.4rem`) chip showing the theme's background with two inner
  dots (count + accent). Hover lifts it `1px` (`translateY(-1px)`), the only "lift" in the
  system and a purely transient hint.

### Settings Gear

- A `2.75rem` transparent icon button, muted at rest, `0.5rem` radius. On hover the icon
  goes ink and a faint tinted wash (`color-mix` of muted) fills the square. Fixed top-right.

### The Counter (signature component)

- The product itself: `<p class="count" role="button">` — a large tabular figure, an
  accent separator dot (`.sep`), and a masked monospace fraction (`.fraction`). It is
  clickable to cycle units (years → days → weeks → weeks-left) and keyboard-operable
  (Enter / Space), with a live-updating `aria-label`. Focus shows a `2px` outline at `8px`
  offset. It enters with a single `rise` animation (`0.55s` ease-out-expo) and cross-fades
  on unit change.

### The Life Meter (signature component)

- A `2px` hairline track (`.progress`) in a translucent muted tone with an accent fill
  (`.progress-fill`) driven by `transform: scaleX(fraction)` over `0.6s` ease-out-expo.
  Paired with a caption row: born date at left, "% of N yrs lived" at right.

### The Reflection Toggle

- The Settings on/off control (`.switch`): a `2.6 × 1.5rem` fully-rounded **pill**
  (`rounded.full`, `999px`) with a `1px` hairline border and a circular knob that slides
  left→right on toggle; the track fills with accent when on. `transition: 0.15s ease`. The
  pill is the one fully-rounded shape in the system — it reads instantly as a switch and is
  reserved for that control.

### Life in Weeks (view)

- A full-screen calendar where each row is a year and each cell a week: a 52-column grid of
  `1px`-radius (`rounded.2xs` hairline) squares with `aspect-ratio: 1` and `2px` gaps, in
  three tonal states — lived (`count`-tinted), now (accent), future (translucent muted). The
  legend swatches share the same hairline radius. The `2xs` (`1px`) corner just softens the
  hard edge across the ~4,000-cell field without rounding the cells into dots — anything
  larger reads as chips and breaks the plotted-grid feel.

## 6. Do's and Don'ts

### Do:

- **Do** keep the number the loudest thing on the screen; subordinate everything else in
  size and contrast.
- **Do** use `tabular-nums` + `"tnum" 1` on any figure that updates in place.
- **Do** spend the accent (`#007ea6`) on one live point — the "now" dot, the elapsed fill,
  or the primary action — and nothing else.
- **Do** validate contrast for every theme and every user-picked color (count/label ≥ 4.5:1
  on bg, accent ≥ 3:1), as `store.js` already does.
- **Do** paint the correct `--bg` before the stylesheet loads (inline in `tab.html`) so dark
  mode never flashes white.
- **Do** give every animation a `prefers-reduced-motion: reduce` path (instant/crossfade),
  and ease with exponential out-curves (`cubic-bezier(0.16, 1, 0.3, 1)`).

### Don't:

- **Don't** build a gamified streak/habit tracker — no badges, rewards, or "don't break the
  chain" pressure.
- **Don't** turn the tab into a productivity dashboard — no widget grids, cards, charts, or
  feeds.
- **Don't** use morbid memento-mori kitsch — no skulls, tombstones, or hourglasses.
- **Don't** go cutesy or emoji-forward — no mascots, bouncy motion, or jokey copy.
- **Don't** add `box-shadow`, cards, or glassmorphism; depth is tonal + ambient light only.
- **Don't** use gradient text, `border-left` accent stripes, or a tracked uppercase eyebrow
  on every element — the one `AGE` label is the only eyebrow the system gets.

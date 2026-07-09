# Product

## Register

product

## Users

People who open a new browser tab dozens of times a day and want a quiet, recurring
confrontation with the finite length of their life — so they live it more deliberately.
They lean reflective and design-literate; they'd rather have a still, well-made object
in front of them than another feed. The moment of use is fleeting: a half-second glance
between tasks, not a session. The job to be done is emotional, not functional — "remind
me, without nagging me, that time is passing" — so the interface has to land instantly
and then get out of the way.

## Product Purpose

Mortality replaces the browser's new tab page with a live counter of your age. The number
ticks in real time (down to fractional years), and can be read instead as days lived,
weeks lived, weeks left, or percent of an expected lifetime elapsed. It exists to keep
mortality gently and continuously present — a memento mori you meet in passing rather than
a task you open. It is a zero-dependency browser extension (Chrome, Firefox, Edge) with no
build step: the files in `src/` are the extension.

Success looks like an extension people keep installed for years because it earns its
glance: calm enough to never feel like pressure, honest enough to occasionally stop them,
and beautiful enough that seeing their own life tick past feels like a small gift rather
than an alarm.

## Brand Personality

Calm, editorial, honest. The voice is spare and factual — it states the number and the
date and trusts the user to feel the weight; it never preaches, gamifies, or performs
gloom. Typographic and still, closer to a well-set page or a good watch face than to an
app. The emotional target is **calm contemplation**: a steady reminder, not an emergency.
Warmth lives in restraint and craft, not in decoration.

## Anti-references

Mortality should never look or behave like:

- A **gamified streak / habit tracker** — no badges, no rewards, no "don't break the chain"
  pressure. Time passing is not a game to win.
- A **busy productivity dashboard** — no widget grids, cards, charts, or feeds competing
  for attention. One idea per screen.
- **Morbid, "edgy" memento-mori kitsch** — no skulls, tombstones, hourglasses, or shock
  imagery. The gravity comes from plain facts, not props.
- **Cutesy, emoji-forward playfulness** — no mascots, bouncy motion, or jokey copy that
  undercuts the subject.

## Design Principles

1. **Calm over alarm.** A steady, contemplative reminder — never a nag, a countdown that
   induces panic, or a guilt trip. If a choice makes the user anxious rather than
   reflective, it's wrong.
2. **The number is the product.** One honest figure, given room to breathe. Every other
   element (label, meter, born date) is subordinate and earns its place or leaves.
3. **Disappear into the glance.** It's read in half a second between tasks. It must be
   legible instantly, require no interaction to deliver its value, and never demand a
   session.
4. **Honest, not morbid.** Memento mori through plain facts and restraint, not symbolism
   or dread. Let the arithmetic carry the weight.
5. **Respect the user's canvas.** This is their new tab, every day, for years — so quiet
   defaults, fast paint, sensible personalization (themes, life expectancy), and durable
   storage matter as much as the visuals.

## Accessibility & Inclusion

Commit to **WCAG 2.1 AA**, maintaining the bar already set in code:

- Contrast-checked color themes: counter and label ≥ 4.5:1 against the background, accent
  ≥ 3:1. Every bundled preset and the default light/dark palettes meet this.
- Full `prefers-reduced-motion` alternative — the ambient glow and count animations degrade
  to instant/static.
- Respects `prefers-color-scheme` for light and dark, painting the correct backdrop before
  first paint to avoid a flash.
- Visible `:focus-visible` outlines on every interactive control; the counter and settings
  are keyboard operable.
- ARIA labels and roles on interactive elements (the counter acts as a labelled button;
  live value changes are announced).

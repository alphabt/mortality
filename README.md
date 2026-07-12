# Mortality

A browser extension that replaces your new tab page with a live counter of your age — a quiet, recurring reminder that time is passing.

[**Try Mortality online**](https://alphabt.github.io/mortality/)

The online demo saves settings in this browser's local storage. Install the extension
from a browser store below to use Mortality as your new tab page.

![Screenshot Light Theme](/images/screenshot_light.png?raw=true)

![Screenshot Dark Theme](/images/screenshot_dark.png?raw=true)

## Features

- **Live age counter** — ticks in real time, down to fractional years.
- **Multiple units** — switch between age, calendar age, a live next-birthday
  countdown, days or weeks lived, time left, and percent of an expected lifetime
  elapsed.
- **Actuarial estimate** — conditions expected lifespan on your current age, using an
  explicitly selected World (UN 2023) or United States (SSA 2023) baseline.
- **Personalization** — light and dark themes that follow your system, color presets
  and custom colors, plus a fully custom life expectancy.
- **Language choice** — follows your browser by default, with a manual choice from all
  55 official Chrome WebExtension locales.
- **Accessible and calm** — WCAG 2.1 AA, a `prefers-reduced-motion` path, and full
  keyboard support.

## Languages

Mortality follows the browser/OS locale by default and falls back to English. You can
choose a different language during setup or later under **Settings → Display**. It ships
every
[Chrome-supported extension locale](https://developer.chrome.com/docs/extensions/reference/api/i18n#locales):
`ar`, `am`, `bg`, `bn`, `ca`, `cs`, `da`, `de`, `el`, `en`, `en_AU`, `en_GB`,
`en_US`, `es`, `es_419`, `et`, `fa`, `fi`, `fil`, `fr`, `gu`, `he`, `hi`, `hr`,
`hu`, `id`, `it`, `ja`, `kn`, `ko`, `lt`, `lv`, `ml`, `mr`, `ms`, `nl`, `no`,
`pl`, `pt_BR`, `pt_PT`, `ro`, `ru`, `sk`, `sl`, `sr`, `sv`, `sw`, `ta`, `te`,
`th`, `tr`, `uk`, `vi`, `zh_CN`, and `zh_TW`.

## Privacy

Mortality has no accounts, servers, or analytics. It requests a single permission —
`storage` — to save your settings locally, and collects no data. Everything stays in
your browser.

## Install

<a href="https://chrome.google.com/webstore/detail/mortality/dmcopoldcoemapdejndbdnfmbofbkmbh"><img src="./images/chrome_logo.svg" width="50px"/> Add to Chrome</a>

<a href="https://addons.mozilla.org/firefox/addon/mortality/"><img src="./images/firefox_logo.svg" width="50px"/> Add to Firefox</a>

<a href="https://microsoftedge.microsoft.com/addons/detail/dljbhjjkfdabmfijhmcoodklndhminom"><img src="./images/edge_logo.svg" width="50px"/> Add to Edge</a>

## Development

The shipped extension has **no build step and no runtime dependencies** — the
files in [`src/`](src/) _are_ the extension. Development tooling (formatting and
tests) runs through npm and never ships; `npm run zip` only packages `src/`.

### Preview in the Copilot app

Click **Run** to start the local preview and open it in the integrated browser.
The preview serves `src/tab.html`, starting at `http://127.0.0.1:4173/` and
automatically choosing the next available port when another session is running.
Settings use the same local-storage fallback as any ordinary HTTP preview.

To start it from a terminal instead:

```
npm run dev
```

### Run it locally

Load the `src/` folder as an unpacked extension:

- **Chrome / Edge:** open `chrome://extensions`, enable _Developer mode_, click
  _Load unpacked_, and select the `src/` folder.
- **Firefox:** open `about:debugging` → _This Firefox_ → _Load Temporary Add-on_
  and pick `src/manifest.json`.

Edit a file, then reload the extension to see the change.

### Tests

The `src/` modules are covered by a [Vitest](https://vitest.dev/) suite that runs
against a jsdom DOM (unit tests for storage/theming and the view renderers, plus
integration tests that drive the full setup → counter → settings flow). Install
the dev dependencies once with `npm install`, then:

```
npm test              # run the suite once
npm run test:watch    # re-run on change
npm run test:coverage # run with a coverage report
```

The real-browser smoke test loads `src/` as an unpacked extension in Playwright's
pinned Chromium. Install that browser once, then run the test:

```
npx playwright install chromium
npm run test:chromium
```

CI runs formatting, the Vitest suite, the Chromium extension smoke test, and a
packaging smoke test on every pull request via the
[`ci`](.github/workflows/ci.yml) workflow, which the release pipelines reuse so
nothing ships without a green run.

### Package for the stores

```
npm run zip
```

Produces `artifacts/mortality-v<version>.zip`, with the version read from
`src/manifest.json`.

### Publish to the stores

Pushing a `v*` tag runs the [`release`](.github/workflows/release.yml) workflow:
it runs the CI gate, packages the extension once, publishes a GitHub Release, and
submits that exact asset to the Chrome, Edge, and Firefox stores. It authenticates
entirely with scoped store **API keys** kept in repo secrets — never a login.
Manual and subset publishes go through
[`publish-stores`](.github/workflows/publish-stores.yml). Setup, the full secret
list, and manual runs are documented in the
[publish-to-stores skill](.github/skills/publish-to-stores/SKILL.md).

## Credits

- Inspired by [Motivation Chrome extension](https://chrome.google.com/webstore/detail/motivation/ofdgfpchbidcgncgfpdlpclnpaemakoj)
- Icon: original mark — a life-elapsed gauge closing on the counter's signature accent dot

## License

[MIT](LICENSE) © alphabt

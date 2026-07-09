# Mortality

A browser extension that replaces your new tab page with a live counter of your age — a quiet, recurring reminder that time is passing.

![Screenshot Light Theme](/images/screenshot_light.png?raw=true)

![Screenshot Dark Theme](/images/screenshot_dark.png?raw=true)

## Features

- **Live age counter** — ticks in real time, down to fractional years.
- **Multiple units** — switch between age, days lived, weeks lived, weeks left, and
  percent of an expected lifetime elapsed.
- **Personalization** — light and dark themes that follow your system, color presets
  and custom colors, and an adjustable life expectancy.
- **Accessible and calm** — WCAG 2.1 AA, a `prefers-reduced-motion` path, and full
  keyboard support.

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

CI runs formatting, the test suite, and a packaging smoke test on every pull
request via the [`ci`](.github/workflows/ci.yml) workflow, which the release
pipelines reuse so nothing ships without a green run.

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

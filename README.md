# Mortality

A Chrome extension that shows a live counter of your age to motivate you to live life to the fullest.

![Screenshot Light Theme](/images/screenshot_light.png?raw=true)

![Screenshot Dark Theme](/images/screenshot_dark.png?raw=true)

## Install

<a href="https://chrome.google.com/webstore/detail/mortality/dmcopoldcoemapdejndbdnfmbofbkmbh"><img src="./images/chrome_logo.svg" width="50px"/> Add to Chrome</a>

<a href="https://addons.mozilla.org/firefox/addon/mortality/"><img src="./images/firefox_logo.svg" width="50px"/> Add to FireFox</a>

<a href="https://microsoftedge.microsoft.com/addons/detail/dljbhjjkfdabmfijhmcoodklndhminom"><img src="./images/edge_logo.svg" width="50px"/> Add to Edge</a>

## Development

This extension has **no build step and no dependencies** — the files in
[`src/`](src/) _are_ the extension.

### Run it locally

Load the `src/` folder as an unpacked extension:

- **Chrome / Edge:** open `chrome://extensions`, enable _Developer mode_, click
  _Load unpacked_, and select the `src/` folder.
- **Firefox:** open `about:debugging` → _This Firefox_ → _Load Temporary Add-on_
  and pick `src/manifest.json`.

Edit a file, then reload the extension to see the change.

### Package for the stores

```
npm run zip
```

Produces `artifacts/mortality-v<version>.zip`, with the version read from
`src/manifest.json`.

## Credits

- Inspired by [Motivation Chrome extension](https://chrome.google.com/webstore/detail/motivation/ofdgfpchbidcgncgfpdlpclnpaemakoj)
- Icon from <https://icons8.com/>

# Store listing metadata

[`metadata.json`](metadata.json) is the source of truth for content managed in
the Chrome Web Store, Microsoft Edge Add-ons, and Firefox Add-ons dashboards.
It owns:

- the shared website, support, and privacy URLs;
- the Chrome category;
- detailed descriptions for the nine priority locales;
- localized Edge search terms; and
- Firefox's global tags.

The extension name and package summary are deliberately not copied into the
metadata file. They resolve from `extName` and `extDescription` in
`src/_locales/*/messages.json`, as referenced by `src/manifest.json`. This keeps
all 55 package summaries in one place.

Run the validator before editing a dashboard:

```sh
npm run store:validate
npm run store:show -- en
npm run store:show -- de
```

`store:show` prints the package summary, detailed description, Edge search
terms, shared URLs, platform locale codes, and global Firefox tags as one
dashboard-ready block. Supported detailed-description locales are `en`, `de`,
`es`, `fr`, `ja`, `pt_BR`, `zh_CN`, `zh_TW`, and `ko`.

## Shared canonical content

Use the following fields on every store where the dashboard exposes them:

| Field   | Canonical value                                      |
| ------- | ---------------------------------------------------- |
| Name    | `Mortality`                                          |
| Summary | Resolved from each locale's `extDescription` message |
| Website | `https://alphabt.github.io/mortality/`               |
| Support | `https://github.com/alphabt/mortality/issues`        |
| Privacy | `https://alphabt.github.io/mortality/privacy.html`   |

Detailed descriptions are also shared across stores. Platform-only discovery
fields stay separate:

| Store   | Platform-only field                                            |
| ------- | -------------------------------------------------------------- |
| Chrome  | Category: `Well-being`; Chrome has no dedicated keyword field. |
| Edge    | Localized search terms: at most 7 terms and 21 words in total. |
| Firefox | Global, unlocalized tags: `dark mode` and `privacy`.           |

Firefox only accepts tags from its current global tag vocabulary. The two tags
above were available in the official
[`/api/v5/addons/tags/`](https://addons.mozilla.org/api/v5/addons/tags/)
response on 2026-07-12; recheck the endpoint before applying them if the
dashboard rejects either value.

## Apply to Chrome Web Store

1. Run `npm run store:validate`, then open the extension in the
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Open **Store listing**. Under **Product details**, set **Primary category**
   to **Well-being**.
3. Select each priority language from the language menu. Run
   `npm run store:show -- <locale>` and paste **FULL DESCRIPTION** into
   **Detailed description**. The package supplies the localized name and
   summary; do not create a second summary in `metadata.json`.
4. Under **Additional fields**, set **Homepage URL** to the canonical website
   and **Support URL** to the canonical support URL. Verify the GitHub Pages
   site in Search Console if needed, then select it from **Official URL**.
5. Open **Privacy practices** and set the privacy-policy link to the canonical
   privacy URL. Keep the data-use declarations consistent with the extension's
   local-by-default storage and explicit opt-in browser-account sync.
6. Save the draft, preview the localized listings, and submit the metadata
   update for review.

Chrome has no keyword or search-term field. Do not copy Edge search terms into
the description; Chrome's policy treats keyword stuffing as spam.

Official references:
[Store listing tab](https://developer.chrome.com/docs/webstore/cws-dashboard-listing),
[Privacy practices](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy),
and [category guidance](https://developer.chrome.com/docs/webstore/best-practices).

## Apply to Microsoft Edge Add-ons

1. Run `npm run store:validate`, then open Mortality in
   [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/public/login?ref=dd).
2. Open **Properties**. Set **Website** to the canonical website and
   **Support contact detail** to the canonical support URL. Leave the Edge
   category unchanged unless it is reviewed separately; `Well-being` is the
   canonical Chrome category, not a cross-store category identifier.
3. Open **Privacy** and set **Privacy policy** to the canonical privacy URL.
   If the account still has the older form, set **Privacy policy URL** under
   **Properties** instead.
4. Open **Store listings**, then **Details for \<language\>** for every priority
   locale. The uploaded package supplies the read-only extension name and
   short description. Run `npm run store:show -- <locale>`, paste **FULL
   DESCRIPTION** into the detailed description, and enter each **EDGE SEARCH
   TERMS** item as one search term.
5. Save each language, fix any Partner Center field errors, and submit the
   updated listing for certification.

The validator enforces Edge's documented detailed-description range of
250–10,000 characters, maximum of 7 search terms, maximum of 30 characters per
term, and maximum of 21 words across all terms.

Official reference:
[Publish a Microsoft Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).

## Apply to Firefox Add-ons

1. Run `npm run store:validate`, then open Mortality in the
   [Add-ons Developer Hub](https://addons.mozilla.org/developers/).
2. Open the add-on's product-page editor. For each priority locale, keep the
   name as `Mortality`, copy **PACKAGE SUMMARY** to the localized summary, and
   copy **FULL DESCRIPTION** to the localized description.
3. Set **Homepage** to the canonical website, **Support site** to the canonical
   support URL, and **Privacy policy** to the canonical privacy URL.
4. Set the global tags to the **FIREFOX TAGS (GLOBAL)** values printed by
   `store:show`. AMO tags are simple unlocalized strings, so do not translate
   them per locale.
5. Save the product-page changes and inspect the public localized pages.

Official references:
[Create an appealing listing](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/)
and [AMO tag API](https://mozilla.github.io/addons-server/topics/api/tags.html).

## Why listing updates remain manual

The release workflow remains responsible only for immutable extension
packages:

- Chrome Web Store API v2 uploads, checks, and publishes package revisions.
  Google notes that additional metadata still has to be supplied in the
  Developer Dashboard.
- The Edge Update REST API explicitly has no endpoint for product metadata such
  as descriptions; those edits require Partner Center.
- AMO documents an authenticated add-on metadata `PATCH`, but also states that
  the API is not frozen and may change without warning. Its API key can act on
  behalf of the developer account, and the documented edit payload does not
  cover every required support/privacy field.

Adding partial AMO-only automation would therefore expand secret scope while
leaving the other stores and some AMO fields manual. Keep
`.github/workflows/publish.yml` and `scripts/publish.sh` package-only, and apply
this metadata through the dashboards.

Official API references:
[Chrome Web Store API v2](https://developer.chrome.com/blog/cws-api-v2),
[Edge Update REST API](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api),
[AMO add-on API](https://mozilla.github.io/addons-server/topics/api/addons.html),
and [AMO authentication](https://mozilla.github.io/addons-server/topics/api/auth.html).

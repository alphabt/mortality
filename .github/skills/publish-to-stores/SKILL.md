---
name: publish-to-stores
description: >-
  Publish a release of the Mortality browser extension to the Chrome Web Store,
  Microsoft Edge Add-ons, and Firefox (addons.mozilla.org). Use when asked to
  publish, ship, release, or push the extension (or the latest release / a
  tag / a new version) to the web stores, or to set up store-publishing
  credentials and secrets.
license: MIT
---

# Publish to the Chrome, Edge, and Firefox stores

Ships a tagged release to all three extension stores through the
`publish-stores` GitHub Actions workflow. All credentials live in **repo
secrets** — never a developer's login, only scoped, revocable API keys.

- Workflow: [`.github/workflows/publish-stores.yml`](../../workflows/publish-stores.yml)
- Engine: [`scripts/publish.sh`](../../../scripts/publish.sh)

## How publishing works

- **Chrome** — Web Store API v2: refresh an access token, upload the package,
  then `:publish`.
- **Edge** — Add-ons API v1.1: upload the package, poll, publish the draft,
  poll again.
- **Firefox** — `web-ext sign --channel=listed` uploads to the listed channel
  on addons.mozilla.org.

Each store **submits for review**; the update goes live after the store
approves it (minutes to a few days). A store whose secrets are absent is
skipped, so you can roll them out one at a time.

## One-time setup: create API credentials and add them as secrets

Add each value with `gh secret set <NAME> --repo alphabt/mortality` (or via
**Settings → Secrets and variables → Actions**). None of these are login
passwords.

### Chrome Web Store

| Secret                                      | What it is / where to get it                                                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHROME_EXTENSION_ID`                       | The item id: `dmcopoldcoemapdejndbdnfmbofbkmbh`                                                                                                 |
| `CHROME_PUBLISHER_ID`                       | Developer Dashboard → **Publisher → Settings**                                                                                                  |
| `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` | Google Cloud Console → enable **Chrome Web Store API** → create an **OAuth client (Web application)**                                           |
| `CHROME_REFRESH_TOKEN`                      | [OAuth Playground](https://developers.google.com/oauthplayground) with your own client + scope `https://www.googleapis.com/auth/chromewebstore` |

> Chrome only publishes via API after you've published at least once manually
> with the current visibility settings, and each upload needs a **higher**
> `version` in `src/manifest.json` than the live one.

### Microsoft Edge Add-ons

| Secret                            | What it is / where to get it                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `EDGE_PRODUCT_ID`                 | Partner Center → **Extension overview** (the GUID)                                    |
| `EDGE_CLIENT_ID` / `EDGE_API_KEY` | Partner Center → **Publish API** → **Create API credentials** (v1.1 "new experience") |

### Firefox (addons.mozilla.org)

| Secret                                      | What it is / where to get it                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FIREFOX_JWT_ISSUER` / `FIREFOX_JWT_SECRET` | addons.mozilla.org → **Tools → Manage API Keys**                                                                                                                          |
| `FIREFOX_ADDON_ID`                          | The listed add-on's id/GUID. Required unless `src/manifest.json` already declares `browser_specific_settings.gecko.id`; it is injected into the manifest at publish time. |

## Publishing a release

**Automatic (recommended).** Pushing a `v*` tag runs both `tagged-release`
(creates the GitHub Release) and `publish-stores` (builds from the tag and
publishes). Bump `src/manifest.json` `version`, then:

```bash
git tag v1.5.0 && git push origin v1.5.0
```

**On demand.** Re-publish a tag, or ship a subset of stores, from the Actions
tab or the CLI:

```bash
# all stores, from tag v1.4.0
gh workflow run publish-stores.yml -f stores=all -f ref=v1.4.0

# just one or two stores
gh workflow run publish-stores.yml -f stores="edge firefox" -f ref=v1.4.0
```

## Agent playbook

When asked to publish a release to the stores:

1. **Confirm the target** tag/version (default: the latest `v*` release).
2. **Check secrets** exist: `gh secret list --repo alphabt/mortality`. If a
   store's secrets are missing, walk the user through the setup table above —
   do not attempt to fabricate credentials.
3. **Verify the version** in `src/manifest.json` is newer than what's live
   (all three stores reject re-uploads of an existing version).
4. **Trigger** the workflow: `gh workflow run publish-stores.yml -f stores=all
-f ref=<tag>` (or instruct the user to push the tag).
5. **Watch**: `gh run watch $(gh run list --workflow=publish-stores.yml -L1 \
--json databaseId -q '.[0].databaseId')` and report per-store results.
6. **Report** that each store has been _submitted for review_ and note that
   going live depends on each store's approval.

## Troubleshooting

- **A store was skipped** — its secrets aren't set. Add them, or name the store
  explicitly to force a hard failure that shows which are missing.
- **`version` already exists / not increased** — bump `version` in
  `src/manifest.json` and re-tag.
- **Chrome publish rejected** — publish once manually in the dashboard to
  confirm visibility, then retry.
- **Firefox "add-on not found" / creates a new listing** — set
  `FIREFOX_ADDON_ID` to the existing add-on's id so the update targets it.
- **Firefox run hangs / times out "waiting for approval"** — listed versions
  need Mozilla's human review (days), so the workflow passes
  `--approval-timeout=0`: `web-ext sign` returns as soon as the version is
  submitted. The signed XPI appears on the add-on's Versions page once approved.
- **Dry run** — locally, `bash scripts/publish.sh <store> --zip <file>
--dry-run` authenticates and uploads without the final publish.

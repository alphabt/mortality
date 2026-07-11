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

Ships a tagged release to all three extension stores. All credentials live in
**repo secrets** — never a developer's login, only scoped, revocable API keys.

- Automatic pipeline: [`.github/workflows/release.yml`](../../workflows/release.yml)
  — on a `v*` tag it runs the CI gate, packages once, publishes the GitHub
  Release, then ships that asset to the stores.
- Manual / subset runs: [`.github/workflows/publish-stores.yml`](../../workflows/publish-stores.yml)
- Shared engine: [`.github/workflows/publish.yml`](../../workflows/publish.yml)
  wrapping [`scripts/publish.sh`](../../../scripts/publish.sh)

## How publishing works

- **Chrome** — Web Store API v2: refresh an access token, replace an older
  pending review when necessary, upload the package, then `:publish`.
- **Edge** — Add-ons API v1.1: upload the package, poll, publish the draft,
  poll again.
- **Firefox** — the exact `web-ext` version locked in `package-lock.json` runs
  `sign --channel=listed` and uploads to addons.mozilla.org.

Each store **submits for review**; the update goes live after the store
approves it (minutes to a few days). Stores run in isolated jobs that receive
only their own credentials. With `stores=all`, an unconfigured store is skipped;
an explicitly requested store fails fast when its credentials are incomplete.

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

**Automatic (recommended).** Pushing a `v*` tag runs the
[`release`](../../workflows/release.yml) workflow end to end: CI gate → package
once → GitHub Release → publish to the stores. The tag must match the version in
**both** `src/manifest.json` and `package.json`, or the release job fails fast.
Bump all three in lockstep, then:

```bash
git tag v1.5.0 && git push origin v1.5.0
```

**On demand.** Re-publish a release, or ship a subset of stores, from the Actions
tab or the CLI:

```bash
# all stores, from the asset attached to release v1.4.0
gh workflow run publish-stores.yml -f stores=all -f tag=v1.4.0

# just one or two stores
gh workflow run publish-stores.yml -f stores="edge firefox" -f tag=v1.4.0

# leave tag blank to use the latest published release asset
gh workflow run publish-stores.yml -f stores=chrome
```

Manual publishing never builds from a branch. New code must pass the tag-driven
release workflow's CI gate and publish the immutable GitHub Release asset first.

## Agent playbook

When asked to publish a release to the stores:

1. **Confirm the target** tag/version (default: the latest `v*` release).
2. **Check secrets** exist: `gh secret list --repo alphabt/mortality`. If a
   store's secrets are missing, walk the user through the setup table above —
   do not attempt to fabricate credentials.
3. **Verify the version** in `src/manifest.json` and `package.json` match and are
   newer than what's live (all three stores reject re-uploads of an existing
   version; the `release` job also fails if the tag and both files disagree).
4. **Trigger** publishing. For a fresh release, have the user push the `v*` tag
   (the `release` workflow packs, releases, and publishes). To re-publish or ship
   a subset: `gh workflow run publish-stores.yml -f stores=all -f tag=<tag>`.
5. **Watch**: `gh run watch $(gh run list --workflow=release.yml -L1 \
--json databaseId -q '.[0].databaseId')` (use `publish-stores.yml` for a
   manual run) and report per-store results.
6. **Report** that each store has been _submitted for review_ and note that
   going live depends on each store's approval.

## Troubleshooting

- **A store was skipped** — its secrets aren't set. Add them, or name the store
  explicitly to force a hard failure that shows which are missing.
- **`version` already exists / not increased** — bump `version` in
  `src/manifest.json` **and** `package.json` (they must match) and re-tag.
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

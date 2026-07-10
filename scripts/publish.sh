#!/usr/bin/env bash
# Publish the packaged extension to the Chrome Web Store, Microsoft Edge
# Add-ons, and Firefox (addons.mozilla.org).
#
# This is the engine invoked by the release and manual publishing workflows. It
# reads every credential from the environment; in CI those come from repo secrets.
#
# Usage:
#   scripts/publish.sh [chrome] [edge] [firefox] [options]
#
# With no store names, every store whose credentials are present is published.
# Naming stores explicitly publishes exactly those and fails if a named store's
# credentials are missing.
#
# Artifact selection (what gets uploaded):
#   (default)      Download the latest GitHub release asset (mortality-*.zip).
#   --tag <tag>    Download that release's asset instead of the latest.
#   --source       Build a fresh zip from src/ with scripts/pack.sh.
#   --zip <path>   Upload an existing local .zip.
#
# Other options:
#   --dry-run      Authenticate and upload, but skip the final "publish" call.
#   -h, --help     Show this help.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  c_reset=$'\033[0m'; c_bold=$'\033[1m'; c_red=$'\033[31m'
  c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_blue=$'\033[34m'
else
  c_reset=''; c_bold=''; c_red=''; c_green=''; c_yellow=''; c_blue=''
fi

log()  { printf '%s\n' "${c_blue}==>${c_reset} $*"; }
ok()   { printf '%s\n' "${c_green}[ok]${c_reset} $*"; }
warn() { printf '%s\n' "${c_yellow}[warn]${c_reset} $*" >&2; }
die()  { printf '%s\n' "${c_red}[error] $*${c_reset}" >&2; exit 1; }

# Credentials that make each store publishable.
chrome_vars=(CHROME_CLIENT_ID CHROME_CLIENT_SECRET CHROME_REFRESH_TOKEN \
  CHROME_PUBLISHER_ID CHROME_EXTENSION_ID)
edge_vars=(EDGE_PRODUCT_ID EDGE_CLIENT_ID EDGE_API_KEY)
firefox_vars=(FIREFOX_JWT_ISSUER FIREFOX_JWT_SECRET FIREFOX_ADDON_ID)

require_env() {
  local missing=() v
  for v in "$@"; do [ -n "${!v:-}" ] || missing+=("$v"); done
  [ ${#missing[@]} -eq 0 ] || die "Missing required secret(s): ${missing[*]}"
}

is_configured() {
  local v
  for v in "$@"; do [ -n "${!v:-}" ] || return 1; done
  return 0
}

# curl wrapper: stores the response body and status in the current shell. Call
# it directly (not through command substitution) so both values remain visible.
http_code=000
response_body=""
request() {
  local method="$1" url="$2"; shift 2
  local output curl_status
  output="$(mktemp)"
  response_body=""
  http_code=000

  if http_code="$(curl -sS -o "$output" -w '%{http_code}' \
    -X "$method" "$@" "$url")"; then
    curl_status=0
  else
    curl_status=$?
  fi

  response_body="$(<"$output")"
  rm -f "$output"

  [ "$curl_status" -eq 0 ] || return "$curl_status"
  [[ "$http_code" =~ ^2[0-9][0-9]$ ]]
}

# ---------------------------------------------------------------------------
# Chrome Web Store  (v2 REST API)
# ---------------------------------------------------------------------------
publish_chrome() {
  require_env "${chrome_vars[@]}"
  log "${c_bold}Chrome Web Store${c_reset}"

  local body token
  request POST https://oauth2.googleapis.com/token \
    --data-urlencode "client_id=$CHROME_CLIENT_ID" \
    --data-urlencode "client_secret=$CHROME_CLIENT_SECRET" \
    --data-urlencode "refresh_token=$CHROME_REFRESH_TOKEN" \
    --data-urlencode "grant_type=refresh_token" \
    || die "Chrome: token request failed (HTTP $http_code): $response_body"
  body="$response_body"
  token="$(printf '%s' "$body" | jq -er \
    '.access_token | select(type == "string" and length > 0)')" \
    || die "Chrome: no access token in response: $body"

  local api="https://chromewebstore.googleapis.com"
  local item="publishers/$CHROME_PUBLISHER_ID/items/$CHROME_EXTENSION_ID"

  log "Chrome: uploading package"
  request POST "$api/upload/v2/$item:upload" \
    -H "Authorization: Bearer $token" -T "$ZIP" \
    || die "Chrome: upload failed (HTTP $http_code): $response_body"
  body="$response_body"
  local state
  state="$(printf '%s' "$body" | jq -er \
    '.uploadState | select(type == "string" and length > 0)')" \
    || die "Chrome: upload response omitted uploadState: $body"
  chrome_wait_upload "$state" "$api/v2/$item:fetchStatus" "$token"
  ok "Chrome: package accepted"

  if $DRY_RUN; then warn "Chrome: --dry-run, not publishing"; return; fi

  log "Chrome: publishing to public"
  request POST "$api/v2/$item:publish" \
    -H "Authorization: Bearer $token" -H "Content-Length: 0" \
    || die "Chrome: publish failed (HTTP $http_code): $response_body"
  body="$response_body"
  state="$(printf '%s' "$body" | jq -er \
    '.state | select(type == "string" and length > 0)')" \
    || die "Chrome: publish response omitted state: $body"
  case "$state" in
    PENDING_REVIEW|PUBLISHED)
      ok "Chrome: submitted $VERSION (state=$state)" ;;
    *)
      die "Chrome: publish ended in non-public state $state" ;;
  esac
}

chrome_wait_upload() {
  local state="$1" status_url="$2" token="$3"
  local i body

  for i in $(seq 1 60); do
    case "$state" in
      SUCCEEDED) return 0 ;;
      FAILED|NOT_FOUND) die "Chrome: upload ended in $state" ;;
      IN_PROGRESS)
        [ "$i" -lt 60 ] || break
        printf '    Chrome: upload IN_PROGRESS...\n'
        sleep 5
        request GET "$status_url" -H "Authorization: Bearer $token" \
          || die "Chrome: upload status failed (HTTP $http_code): $response_body"
        body="$response_body"
        state="$(printf '%s' "$body" | jq -er \
          '.lastAsyncUploadState | select(type == "string" and length > 0)')" \
          || die "Chrome: status response omitted lastAsyncUploadState: $body"
        ;;
      *) die "Chrome: unknown upload state '$state'" ;;
    esac
  done

  die "Chrome: timed out waiting for upload"
}

# ---------------------------------------------------------------------------
# Microsoft Edge Add-ons  (v1.1 REST API)
# ---------------------------------------------------------------------------
edge_operation_id() {
  local loc
  loc="$(grep -i '^location:' "$1" | tail -1 | tr -d '\r\n')"
  loc="${loc#*:}"; loc="${loc//[[:space:]]/}"; loc="${loc##*/}"
  [ -n "$loc" ] || die "Edge: no operation id in response headers"
  printf '%s' "$loc"
}

edge_wait() {
  local url="$1" what="$2"; shift 2
  local i resp status message
  for i in $(seq 1 60); do
    request GET "$url" "$@" \
      || die "Edge: status request failed (HTTP $http_code): $response_body"
    resp="$response_body"
    status="$(printf '%s' "$resp" | jq -er \
      '.status | select(type == "string" and length > 0)')" \
      || die "Edge: $what status response omitted status: $resp"
    case "$status" in
      Succeeded) return 0 ;;
      Failed)
        message="$(printf '%s' "$resp" | jq -r '.message // .errorCode // "unknown error"')"
        die "Edge: $what failed: $message" ;;
      InProgress) printf '    Edge: %s InProgress...\n' "$what"; sleep 5 ;;
      *) die "Edge: unknown $what status '$status'" ;;
    esac
  done
  die "Edge: timed out waiting for $what"
}

publish_edge() {
  require_env "${edge_vars[@]}"
  log "${c_bold}Microsoft Edge Add-ons${c_reset}"

  local api="https://api.addons.microsoftedge.microsoft.com/v1/products/$EDGE_PRODUCT_ID"
  local -a auth=(-H "Authorization: ApiKey $EDGE_API_KEY" -H "X-ClientID: $EDGE_CLIENT_ID")
  local hdr op

  log "Edge: uploading package"
  hdr="$(mktemp)"
  http_code="$(curl -sS -D "$hdr" -o /dev/null -w '%{http_code}' \
    -X POST "${auth[@]}" -H "Content-Type: application/zip" \
    -T "$ZIP" "$api/submissions/draft/package")" \
    || { rm -f "$hdr"; die "Edge: upload request failed"; }
  [ "$http_code" = 202 ] || { rm -f "$hdr"; die "Edge: upload failed (HTTP $http_code)"; }
  op="$(edge_operation_id "$hdr")"; rm -f "$hdr"
  edge_wait "$api/submissions/draft/package/operations/$op" "upload" "${auth[@]}"
  ok "Edge: package accepted"

  if $DRY_RUN; then warn "Edge: --dry-run, not publishing"; return; fi

  log "Edge: publishing draft"
  hdr="$(mktemp)"
  http_code="$(curl -sS -D "$hdr" -o /dev/null -w '%{http_code}' \
    -X POST "${auth[@]}" -H "Content-Type: application/json" \
    -d "{\"notes\":\"Automated publish of $VERSION\"}" \
    "$api/submissions")" \
    || { rm -f "$hdr"; die "Edge: publish request failed"; }
  [ "$http_code" = 202 ] || { rm -f "$hdr"; die "Edge: publish failed (HTTP $http_code)"; }
  op="$(edge_operation_id "$hdr")"; rm -f "$hdr"
  edge_wait "$api/submissions/operations/$op" "publish" "${auth[@]}"
  ok "Edge: published $VERSION (certification pending)"
}

# ---------------------------------------------------------------------------
# Firefox  (addons.mozilla.org, via web-ext)
# ---------------------------------------------------------------------------
publish_firefox() (
  require_env "${firefox_vars[@]}"
  log "${c_bold}Firefox (addons.mozilla.org)${c_reset}"
  local web_ext="$repo_root/node_modules/.bin/web-ext"
  [ -x "$web_ext" ] \
    || die "Firefox: run 'npm ci' to install the locked web-ext dependency"

  # web-ext signs a source directory, so unpack the resolved artifact and sign
  # the exact bytes shipped to Chrome and Edge.
  local src; src="$(mktemp -d)"
  trap 'rm -rf "$src"' EXIT
  python3 -m zipfile -e "$ZIP" "$src"

  # A listed add-on can only be updated by an upload that carries its Firefox
  # add-on id. Inject it when the manifest doesn't already declare one.
  if [ -n "${FIREFOX_ADDON_ID:-}" ]; then
    python3 - "$src/manifest.json" "$FIREFOX_ADDON_ID" <<'PY'
import json, sys
path, addon_id = sys.argv[1], sys.argv[2]
with open(path) as f:
    manifest = json.load(f)
gecko = manifest.setdefault("browser_specific_settings", {}).setdefault("gecko", {})
gecko.setdefault("id", addon_id)
with open(path, "w") as f:
    json.dump(manifest, f, indent=2)
PY
  fi

  local -a args=(--source-dir="$src" --artifacts-dir="$repo_root/artifacts" \
    --api-key="$FIREFOX_JWT_ISSUER" --api-secret="$FIREFOX_JWT_SECRET")

  if $DRY_RUN; then
    warn "Firefox: --dry-run, linting instead of signing"
    "$web_ext" lint --source-dir="$src"
    return
  fi

  log "Firefox: uploading & submitting to the listed channel"
  # --approval-timeout=0: return as soon as the version is submitted instead of
  # blocking until Mozilla's human review approves it (which takes days).
  "$web_ext" sign --channel=listed --approval-timeout=0 "${args[@]}"
  ok "Firefox: submitted $VERSION (review pending)"
)

# ---------------------------------------------------------------------------
# Artifact resolution
# ---------------------------------------------------------------------------
resolve_artifact() {
  mkdir -p artifacts
  case "$artifact_mode" in
    zip)
      [ -n "$artifact_zip" ] || die "--zip requires a path"
      [ -f "$artifact_zip" ] || die "No such file: $artifact_zip"
      ZIP="$artifact_zip" ;;
    source)
      log "Building zip from src/ with scripts/pack.sh"
      bash scripts/pack.sh >&2
      ZIP="$(ls -t artifacts/mortality-*.zip 2>/dev/null | head -1)"
      [ -n "$ZIP" ] || die "pack.sh did not produce artifacts/mortality-*.zip" ;;
    release)
      command -v gh >/dev/null || die "gh CLI is required to download release assets"
      local dir="artifacts/release"
      rm -rf "$dir"; mkdir -p "$dir"
      if [ -n "$artifact_tag" ]; then
        log "Downloading release asset for $artifact_tag"
        gh release download "$artifact_tag" --pattern 'mortality-*.zip' --dir "$dir" >&2
      else
        log "Downloading latest release asset"
        gh release download --pattern 'mortality-*.zip' --dir "$dir" >&2
      fi
      ZIP="$(ls -t "$dir"/mortality-*.zip 2>/dev/null | head -1)"
      [ -n "$ZIP" ] || die "Could not find mortality-*.zip in the release" ;;
  esac
  ZIP="$(cd "$(dirname "$ZIP")" && pwd)/$(basename "$ZIP")"
  VERSION="$(basename "$ZIP" .zip | sed 's/^mortality-//')"
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
usage() { sed -n '2,23p' "${BASH_SOURCE[0]}" | sed 's/^#\{1,\} \{0,1\}//; s/^#$//'; }

stores=()
artifact_mode="release"
artifact_tag=""
artifact_zip=""
DRY_RUN=false

while [ $# -gt 0 ]; do
  case "$1" in
    chrome|edge|firefox) stores+=("$1") ;;
    all) : ;;
    --tag) artifact_mode="release"; artifact_tag="${2:-}"; shift ;;
    --source) artifact_mode="source" ;;
    --zip) artifact_mode="zip"; artifact_zip="${2:-}"; shift ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1 (try --help)" ;;
  esac
  shift
done

if [ ${#stores[@]} -eq 0 ]; then
  if is_configured "${chrome_vars[@]}";  then stores+=(chrome);  fi
  if is_configured "${edge_vars[@]}";    then stores+=(edge);    fi
  if is_configured "${firefox_vars[@]}"; then stores+=(firefox); fi
fi
[ ${#stores[@]} -gt 0 ] || die "No store credentials found in the environment. Add the repo secrets (see .github/skills/publish-to-stores/SKILL.md)."

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
resolve_artifact
log "Artifact: ${c_bold}$ZIP${c_reset} (version $VERSION)"
dry_run_label=""
if $DRY_RUN; then dry_run_label=" (dry-run)"; fi
log "Publishing to: ${c_bold}${stores[*]}${c_reset}$dry_run_label"

for s in "${stores[@]}"; do
  case "$s" in
    chrome)  publish_chrome ;;
    edge)    publish_edge ;;
    firefox) publish_firefox ;;
  esac
done

ok "All requested stores processed."

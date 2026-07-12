import { createHmac, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  loadStoreMetadata,
  renderFullDescription,
  validateStoreMetadata,
} from "./validate-store-metadata.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export const AMO_API_BASE = "https://addons.mozilla.org/api/v5/addons/addon";

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function redact(value, sensitiveValues) {
  let redacted = String(value);
  for (const sensitiveValue of sensitiveValues) {
    if (sensitiveValue) {
      redacted = redacted.replaceAll(sensitiveValue, "[REDACTED]");
    }
  }
  return redacted;
}

export function createAmoJwt({
  issuer,
  secret,
  issuedAt = Math.floor(Date.now() / 1000),
  jwtId = randomUUID(),
}) {
  const header = { alg: "HS256", typ: "JWT" };
  const claims = {
    iss: issuer,
    jti: jwtId,
    iat: issuedAt,
    exp: issuedAt + 60,
  };
  const signingInput = `${encodeJson(header)}.${encodeJson(claims)}`;
  const signature = createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}

export function buildAmoMetadataPayload(metadata, summaries) {
  const name = {};
  const summary = {};
  const description = {};
  const homepage = {};

  for (const [repositoryLocale, localeMetadata] of Object.entries(
    metadata.locales,
  )) {
    const amoLocale = localeMetadata.storeLocales.firefox;
    const localizedSummary = summaries[repositoryLocale];
    if (!localizedSummary) {
      throw new Error(
        `Validated package summary is missing for locale "${repositoryLocale}"`,
      );
    }

    name[amoLocale] = metadata.productName;
    summary[amoLocale] = localizedSummary;
    description[amoLocale] = renderFullDescription(localeMetadata);
    homepage[amoLocale] = metadata.urls.website;
  }

  return {
    name,
    summary,
    description,
    homepage,
    tags: [...metadata.firefox.tags],
  };
}

export function validateAndBuildAmoPayload(metadata, { root = ROOT } = {}) {
  const validation = validateStoreMetadata(metadata, { root });
  if (validation.errors.length > 0) {
    throw new Error(
      `Store metadata validation failed:\n${validation.errors
        .map((error) => `- ${error}`)
        .join("\n")}`,
    );
  }

  return buildAmoMetadataPayload(metadata, validation.summaries);
}

export function loadAmoMetadataPayload(root = ROOT) {
  let metadata;
  try {
    metadata = loadStoreMetadata(root);
  } catch (error) {
    throw new Error(
      `Unable to load canonical store metadata: ${error.message}`,
    );
  }
  return validateAndBuildAmoPayload(metadata, { root });
}

export function buildAmoEndpoint(addonId, apiBase = AMO_API_BASE) {
  return `${apiBase.replace(/\/+$/u, "")}/${encodeURIComponent(addonId)}/`;
}

export function requireAmoCredentials(environment) {
  const names = [
    "FIREFOX_JWT_ISSUER",
    "FIREFOX_JWT_SECRET",
    "FIREFOX_ADDON_ID",
  ];
  const missing = names.filter(
    (name) =>
      typeof environment[name] !== "string" || environment[name].trim() === "",
  );
  if (missing.length > 0) {
    throw new Error(
      `--apply requires the following environment variables: ${missing.join(", ")}`,
    );
  }

  return {
    issuer: environment.FIREFOX_JWT_ISSUER,
    secret: environment.FIREFOX_JWT_SECRET,
    addonId: environment.FIREFOX_ADDON_ID.trim(),
  };
}

export async function publishAmoMetadata({
  payload,
  issuer,
  secret,
  addonId,
  fetchImpl = globalThis.fetch,
  apiBase = AMO_API_BASE,
  issuedAt,
  jwtId,
}) {
  const token = createAmoJwt({ issuer, secret, issuedAt, jwtId });
  let response;

  try {
    response = await fetchImpl(buildAmoEndpoint(addonId, apiBase), {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        Authorization: `JWT ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `AMO metadata request failed: ${redact(message, [
        issuer,
        secret,
        token,
      ])}`,
    );
  }

  if (!response.ok) {
    let responseBody;
    try {
      responseBody = await response.text();
    } catch {
      responseBody = "response body could not be read";
    }
    const detail = redact(responseBody, [issuer, secret, token]).slice(
      0,
      2_000,
    );
    throw new Error(
      `AMO metadata update failed with HTTP ${response.status}${
        detail ? `: ${detail}` : ""
      }`,
    );
  }

  return response.status;
}

function printUsage() {
  console.log(
    "Usage: node scripts/publish-firefox-metadata.mjs [--apply]\n\n" +
      "Without --apply, prints the exact validated AMO PATCH payload and does not require credentials.",
  );
}

export async function runCli({
  args = process.argv.slice(2),
  environment = process.env,
} = {}) {
  if (args.length === 1 && args[0] === "--help") {
    printUsage();
    return;
  }
  if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) {
    throw new Error(
      "Usage: node scripts/publish-firefox-metadata.mjs [--apply]",
    );
  }

  const payload = loadAmoMetadataPayload();
  if (args.length === 0) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  const credentials = requireAmoCredentials(environment);
  const status = await publishAmoMetadata({ payload, ...credentials });
  console.log(`Firefox listing metadata published to AMO (HTTP ${status}).`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

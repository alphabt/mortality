import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  buildAmoEndpoint,
  createAmoJwt,
  loadAmoMetadataPayload,
  publishAmoMetadata,
  validateAndBuildAmoPayload,
} from "../scripts/publish-firefox-metadata.mjs";
import {
  loadStoreMetadata,
  renderFullDescription,
  validateStoreMetadata,
} from "../scripts/validate-store-metadata.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT = join(ROOT, "scripts", "publish-firefox-metadata.mjs");
const WORKFLOW = readFileSync(
  join(ROOT, ".github", "workflows", "publish-firefox-metadata.yml"),
  "utf8",
);
const metadata = loadStoreMetadata(ROOT);
const validation = validateStoreMetadata(metadata, { root: ROOT });
const expectedAmoLocales = [
  "en-US",
  "de",
  "es",
  "fr",
  "ja",
  "pt-BR",
  "zh-CN",
  "zh-TW",
  "ko",
];

function environmentWithoutFirefoxCredentials() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.startsWith("FIREFOX_"),
    ),
  );
}

function decodeJson(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

describe("Firefox listing metadata payload", () => {
  it("contains only officially writable fields with the exact canonical copy", () => {
    const payload = loadAmoMetadataPayload(ROOT);

    expect(Object.keys(payload)).toEqual([
      "name",
      "summary",
      "description",
      "homepage",
      "tags",
    ]);
    expect(payload.tags).toEqual(metadata.firefox.tags);

    for (const [repositoryLocale, localeMetadata] of Object.entries(
      metadata.locales,
    )) {
      const amoLocale = localeMetadata.storeLocales.firefox;
      expect(payload.name[amoLocale]).toBe(metadata.productName);
      expect(payload.summary[amoLocale]).toBe(
        validation.summaries[repositoryLocale],
      );
      expect(payload.description[amoLocale]).toBe(
        renderFullDescription(localeMetadata),
      );
      expect(payload.homepage[amoLocale]).toBe(metadata.urls.website);
    }

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(metadata.urls.support);
    expect(serialized).not.toContain(metadata.urls.privacy);
  });

  it("maps repository locales to the expected AMO locale codes", () => {
    const payload = loadAmoMetadataPayload(ROOT);

    for (const field of ["name", "summary", "description", "homepage"]) {
      expect(Object.keys(payload[field])).toEqual(expectedAmoLocales);
    }
  });

  it("blocks publishing when canonical metadata is malformed", () => {
    const invalid = structuredClone(metadata);
    delete invalid.locales.fr.storeLocales.firefox;

    expect(() => validateAndBuildAmoPayload(invalid, { root: ROOT })).toThrow(
      'Store metadata validation failed:\n- metadata.locales.fr.storeLocales is missing "firefox"',
    );
  });

  it("prints the exact payload in dry-run mode without credentials", () => {
    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: ROOT,
      env: environmentWithoutFirefoxCredentials(),
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual(loadAmoMetadataPayload(ROOT));
  });

  it("requires all existing Firefox credentials when applying", () => {
    const result = spawnSync(process.execPath, [SCRIPT, "--apply"], {
      cwd: ROOT,
      env: environmentWithoutFirefoxCredentials(),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "--apply requires the following environment variables: FIREFOX_JWT_ISSUER, FIREFOX_JWT_SECRET, FIREFOX_ADDON_ID",
    );
  });
});

describe("AMO authentication and request safety", () => {
  it("creates a short-lived, correctly signed HS256 JWT", () => {
    const issuer = "user:123:456";
    const secret = "test-api-secret";
    const token = createAmoJwt({
      issuer,
      secret,
      issuedAt: 1_700_000_000,
      jwtId: "unique-jwt-id",
    });
    const [encodedHeader, encodedClaims, signature] = token.split(".");
    const signingInput = `${encodedHeader}.${encodedClaims}`;

    expect(decodeJson(encodedHeader)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(decodeJson(encodedClaims)).toEqual({
      iss: issuer,
      jti: "unique-jwt-id",
      iat: 1_700_000_000,
      exp: 1_700_000_060,
    });
    expect(signature).toBe(
      createHmac("sha256", secret).update(signingInput).digest("base64url"),
    );
  });

  it("URL-encodes the add-on identifier and sends the exact PATCH body", async () => {
    const payload = loadAmoMetadataPayload(ROOT);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => "",
    });
    const addonId = "mortality/test@example.com?channel=listed";

    await expect(
      publishAmoMetadata({
        payload,
        issuer: "issuer",
        secret: "secret",
        addonId,
        fetchImpl,
        issuedAt: 1_700_000_000,
        jwtId: "request-id",
      }),
    ).resolves.toBe(204);

    expect(buildAmoEndpoint(addonId)).toBe(
      "https://addons.mozilla.org/api/v5/addons/addon/mortality%2Ftest%40example.com%3Fchannel%3Dlisted/",
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe(buildAmoEndpoint(addonId));
    expect(request.method).toBe("PATCH");
    expect(request.headers.Accept).toBe("application/json");
    expect(request.headers["Content-Type"]).toBe("application/json");
    expect(request.headers.Authorization).toMatch(/^JWT [^.]+\.[^.]+\.[^.]+$/u);
    expect(JSON.parse(request.body)).toEqual(payload);
  });

  it("fails loudly on HTTP errors while redacting credentials and tokens", async () => {
    const issuer = "sensitive-issuer";
    const secret = "sensitive-secret";
    const fetchImpl = vi.fn(async (_url, request) => ({
      ok: false,
      status: 403,
      text: async () =>
        `denied issuer=${issuer} secret=${secret} auth=${request.headers.Authorization}`,
    }));

    let failure;
    try {
      await publishAmoMetadata({
        payload: loadAmoMetadataPayload(ROOT),
        issuer,
        secret,
        addonId: "mortality@example.com",
        fetchImpl,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toContain(
      "AMO metadata update failed with HTTP 403",
    );
    expect(failure.message).toContain("[REDACTED]");
    expect(failure.message).not.toContain(issuer);
    expect(failure.message).not.toContain(secret);
    const token = fetchImpl.mock.calls[0][1].headers.Authorization.slice(4);
    expect(failure.message).not.toContain(token);
  });

  it("redacts credentials from transport failures", async () => {
    const secret = "transport-secret";
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error(`failure: ${secret}`));

    await expect(
      publishAmoMetadata({
        payload: loadAmoMetadataPayload(ROOT),
        issuer: "issuer",
        secret,
        addonId: "mortality@example.com",
        fetchImpl,
      }),
    ).rejects.toThrow("AMO metadata request failed: failure: [REDACTED]");
  });
});

describe("Firefox metadata workflow safety", () => {
  it("keeps dry-run ref-independent and blocks apply outside the default branch", () => {
    const dryRunJob = WORKFLOW.slice(
      WORKFLOW.indexOf("  dry-run:\n"),
      WORKFLOW.indexOf("  apply:\n"),
    );
    const applyJob = WORKFLOW.slice(WORKFLOW.indexOf("  apply:\n"));

    expect(dryRunJob).not.toContain("github.ref_name");
    expect(dryRunJob).not.toContain("default_branch");
    expect(dryRunJob).not.toContain("secrets.FIREFOX_");

    expect(applyJob).toContain("SELECTED_REF: ${{ github.ref_name }}");
    expect(applyJob).toContain(
      "DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}",
    );
    expect(applyJob).toContain(
      'if [ "$SELECTED_REF" != "$DEFAULT_BRANCH" ]; then',
    );
    expect(
      applyJob.indexOf("github.event.repository.default_branch"),
    ).toBeLessThan(applyJob.indexOf("secrets.FIREFOX_JWT_ISSUER"));
  });
});

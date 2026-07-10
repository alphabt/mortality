import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PUBLISH_SCRIPT = join(ROOT, "scripts", "publish.sh");
let temp;

const fakeCurl = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const responses = JSON.parse(fs.readFileSync(process.env.MOCK_CURL_RESPONSES, "utf8"));
const indexPath = process.env.MOCK_CURL_INDEX;
const index = fs.existsSync(indexPath) ? Number(fs.readFileSync(indexPath, "utf8")) : 0;
const response = responses[index];
fs.writeFileSync(indexPath, String(index + 1));
if (!response) {
  console.error("Unexpected curl call: " + args.join(" "));
  process.exit(90);
}
for (const expected of response.expect || []) {
  if (!args.join(" ").includes(expected)) {
    console.error("Missing curl argument: " + expected + "\\nActual: " + args.join(" "));
    process.exit(91);
  }
}
const outputAt = args.indexOf("-o");
if (outputAt >= 0) fs.writeFileSync(args[outputAt + 1], response.body || "");
else if (response.body) process.stdout.write(response.body);
const headersAt = args.indexOf("-D");
if (headersAt >= 0) fs.writeFileSync(args[headersAt + 1], response.headers || "");
if (args.includes("-w")) process.stdout.write(String(response.code ?? 200));
process.exit(response.exitCode || 0);
`;

function executable(path, contents) {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
}

function runPublisher(store, responses, { dryRun = false } = {}) {
  const bin = join(temp, "bin");
  mkdirSync(bin, { recursive: true });
  executable(join(bin, "curl"), fakeCurl);
  executable(join(bin, "sleep"), "#!/bin/sh\nexit 0\n");

  const queue = join(temp, "responses.json");
  const index = join(temp, "curl-index");
  const zip = join(temp, "mortality-9.9.9.zip");
  writeFileSync(queue, JSON.stringify(responses));
  writeFileSync(zip, "fixture");

  const args = [PUBLISH_SCRIPT, store, "--zip", zip];
  if (dryRun) args.push("--dry-run");
  const result = spawnSync("bash", args, {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      MOCK_CURL_RESPONSES: queue,
      MOCK_CURL_INDEX: index,
      CHROME_CLIENT_ID: "client",
      CHROME_CLIENT_SECRET: "secret",
      CHROME_REFRESH_TOKEN: "refresh",
      CHROME_PUBLISHER_ID: "publisher",
      CHROME_EXTENSION_ID: "extension",
      EDGE_PRODUCT_ID: "product",
      EDGE_CLIENT_ID: "edge-client",
      EDGE_API_KEY: "edge-key",
    },
  });
  return {
    ...result,
    output: `${result.stdout}${result.stderr}`,
    calls: existsSync(index) ? Number(readFileSync(index, "utf8")) : 0,
  };
}

function tokenResponse(code = 200) {
  return {
    code,
    body: '{"access_token":"test-token"}',
    expect: ["oauth2.googleapis.com/token", "client_id=client"],
  };
}

beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), "mortality-publish-"));
});

afterEach(() => {
  rmSync(temp, { recursive: true, force: true });
});

describe("Chrome publishing", () => {
  it("polls asynchronous uploads before publishing and reports the API state", () => {
    const result = runPublisher("chrome", [
      tokenResponse(),
      {
        code: 200,
        body: '{"uploadState":"IN_PROGRESS"}',
        expect: [":upload", "Authorization: Bearer test-token"],
      },
      {
        code: 200,
        body: '{"lastAsyncUploadState":"IN_PROGRESS"}',
        expect: [":fetchStatus", "-X GET"],
      },
      {
        code: 200,
        body: '{"lastAsyncUploadState":"SUCCEEDED"}',
        expect: [":fetchStatus", "-X GET"],
      },
      {
        code: 200,
        body: '{"state":"PENDING_REVIEW"}',
        expect: [":publish", "Authorization: Bearer test-token"],
      },
    ]);

    expect(result.status, result.output).toBe(0);
    expect(result.calls).toBe(5);
    expect(result.output).toContain("Chrome: package accepted");
    expect(result.output).toContain("state=PENDING_REVIEW");
    expect(result.output).not.toContain("Publishing to: chrome (dry-run)");
  });

  it("labels dry runs accurately and stops after a successful upload", () => {
    const result = runPublisher(
      "chrome",
      [tokenResponse(), { code: 200, body: '{"uploadState":"SUCCEEDED"}' }],
      { dryRun: true },
    );

    expect(result.status, result.output).toBe(0);
    expect(result.calls).toBe(2);
    expect(result.output).toContain("Publishing to: chrome (dry-run)");
    expect(result.output).toContain("--dry-run, not publishing");
  });

  it.each([302, 400, 500])("rejects an HTTP %i token response", (code) => {
    const result = runPublisher("chrome", [tokenResponse(code)]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(`token request failed (HTTP ${code})`);
  });

  it("rejects curl transport failures", () => {
    const result = runPublisher("chrome", [
      { ...tokenResponse(0), exitCode: 7, body: "network failure" },
    ]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("token request failed (HTTP 0)");
  });

  it.each(["FAILED", "NOT_FOUND", "UNRECOGNIZED"])(
    "rejects the terminal or unknown upload state %s",
    (state) => {
      const result = runPublisher("chrome", [
        tokenResponse(),
        { code: 200, body: JSON.stringify({ uploadState: state }) },
      ]);
      expect(result.status).not.toBe(0);
      expect(result.output).toContain(
        state === "UNRECOGNIZED"
          ? "unknown upload state"
          : `upload ended in ${state}`,
      );
    },
  );

  it.each([
    "ITEM_STATE_UNSPECIFIED",
    "STAGED",
    "PUBLISHED_TO_TESTERS",
    "REJECTED",
    "CANCELLED",
    "UNKNOWN",
  ])("rejects the non-public publish state %s", (state) => {
    const result = runPublisher("chrome", [
      tokenResponse(),
      { code: 200, body: '{"uploadState":"SUCCEEDED"}' },
      { code: 200, body: JSON.stringify({ state }) },
    ]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(
      `publish ended in non-public state ${state}`,
    );
  });

  it("accepts an immediately published response", () => {
    const result = runPublisher("chrome", [
      tokenResponse(),
      { code: 200, body: '{"uploadState":"SUCCEEDED"}' },
      { code: 200, body: '{"state":"PUBLISHED"}' },
    ]);
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("state=PUBLISHED");
  });
});

describe("Edge publishing", () => {
  it("polls both accepted operations and publishes the draft", () => {
    const result = runPublisher("edge", [
      {
        code: 202,
        headers:
          "HTTP/1.1 202 Accepted\r\nLocation: https://edge.test/operations/upload-op\r\n\r\n",
        expect: ["submissions/draft/package"],
      },
      {
        code: 200,
        body: '{"status":"InProgress"}',
        expect: ["operations/upload-op", "-X GET"],
      },
      {
        code: 200,
        body: '{"status":"Succeeded"}',
        expect: ["operations/upload-op", "-X GET"],
      },
      {
        code: 202,
        headers:
          "HTTP/1.1 202 Accepted\r\nLocation: https://edge.test/operations/publish-op\r\n\r\n",
        expect: ["/submissions"],
      },
      {
        code: 200,
        body: '{"status":"Succeeded"}',
        expect: ["operations/publish-op", "-X GET"],
      },
    ]);

    expect(result.status, result.output).toBe(0);
    expect(result.calls).toBe(5);
    expect(result.output).toContain("Edge: published 9.9.9");
  });
});

describe("publishing supply-chain and workflow boundaries", () => {
  it("uses an exact local web-ext dependency instead of runtime npx", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const source = readFileSync(PUBLISH_SCRIPT, "utf8");
    expect(pkg.devDependencies["web-ext"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(source).toContain("node_modules/.bin/web-ext");
    expect(source).not.toMatch(/\bnpx\b/);
  });

  it("does not allow branch publishing and isolates each store's secrets", () => {
    const workflow = readFileSync(
      join(ROOT, ".github", "workflows", "publish.yml"),
      "utf8",
    );
    const manual = readFileSync(
      join(ROOT, ".github", "workflows", "publish-stores.yml"),
      "utf8",
    );
    const chrome = workflow.slice(
      workflow.indexOf("  chrome:\n"),
      workflow.indexOf("  edge:\n"),
    );
    const edge = workflow.slice(
      workflow.indexOf("  edge:\n"),
      workflow.indexOf("  firefox:\n"),
    );
    const firefox = workflow.slice(
      workflow.indexOf("  firefox:\n"),
      workflow.indexOf("  complete:\n"),
    );

    expect(workflow).not.toContain("inputs.ref");
    expect(manual).not.toMatch(/^\s+ref:/m);
    expect(chrome).not.toMatch(/EDGE_|FIREFOX_/);
    expect(edge).not.toMatch(/CHROME_|FIREFOX_/);
    expect(firefox).not.toMatch(/CHROME_|EDGE_/);
    expect(firefox).toContain("FIREFOX_ADDON_ID");
    expect(firefox).toContain("npm ci --ignore-scripts");
  });
});

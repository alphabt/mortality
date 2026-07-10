import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../src/", import.meta.url)));
const host = process.env.HOST || "127.0.0.1";
const defaultPort = 4173;
const configuredPort = process.env.PORT?.trim() || undefined;
let port = Number(configuredPort ?? defaultPort);

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new RangeError(`Invalid PORT: ${process.env.PORT}`);
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function respond(response, status, body, headers = {}) {
  response.writeHead(status, {
    "cache-control": "no-store",
    ...headers,
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    respond(response, 405, "Method not allowed", { allow: "GET, HEAD" });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(request.url || "/", "http://localhost").pathname,
    );
  } catch (error) {
    console.error("Invalid preview request URL:", error);
    respond(response, 400, "Bad request");
    return;
  }

  const relativePath =
    pathname === "/" ? "tab.html" : pathname.replace(/^\/+/, "");
  const filePath = resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    respond(response, 403, "Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    const contentType =
      contentTypes[extname(filePath).toLowerCase()] ||
      "application/octet-stream";
    respond(response, 200, request.method === "HEAD" ? undefined : body, {
      "content-type": contentType,
    });
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EISDIR") {
      respond(response, 404, "Not found");
      return;
    }
    console.error(`Could not serve ${pathname}:`, error);
    respond(response, 500, "Internal server error");
  }
});

server.on("error", (error) => {
  if (
    error?.code === "EADDRINUSE" &&
    configuredPort === undefined &&
    port < defaultPort + 100
  ) {
    port += 1;
    server.listen(port, host);
    return;
  }
  console.error("Could not start the Mortality preview:", error);
  process.exitCode = 1;
});

server.on("listening", () => {
  const address = server.address();
  const activePort =
    typeof address === "object" && address ? address.port : port;
  console.log(`Mortality preview ready at http://${host}:${activePort}/`);
});

server.listen(port, host);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
  });
}

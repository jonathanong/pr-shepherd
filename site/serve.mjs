#!/usr/bin/env node
// Tiny zero-dependency static server for previewing site/dist locally.
// Usage: npm run site:build && npm run site:serve

import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative as relativeToDir } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = join(dirname(fileURLToPath(import.meta.url)), "dist");
const port = Number(process.env.PORT ?? 4173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".md": "text/markdown; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/** Join `requestPath` under distDir, refusing anything that would resolve outside it —
 *  checked before any filesystem call touches the request-derived path. */
function safeDistPath(requestPath) {
  const target = join(distDir, requestPath);
  const rel = relativeToDir(distDir, target);
  return rel.startsWith("..") || isAbsolute(rel) ? null : target;
}

function resolveFile(urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    // Malformed percent-escape (e.g. a trailing "/%") — treat as not found rather than
    // letting the URIError crash the whole preview server.
    return null;
  }
  const candidate = clean.endsWith("/") ? `${clean}index.html` : clean;
  const full = safeDistPath(candidate);
  if (!full) return null;
  if (existsSync(full) && statSync(full).isDirectory()) {
    const indexFile = safeDistPath(`${candidate}/index.html`);
    return indexFile && existsSync(indexFile) ? indexFile : null;
  }
  return existsSync(full) && !statSync(full).isDirectory() ? full : null;
}

const server = createServer((req, res) => {
  const file = resolveFile(req.url ?? "/");
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 not found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`site: serving ${distDir} at http://localhost:${port}/`);
});

#!/usr/bin/env node
// Tiny zero-dependency static server for previewing site/dist locally.
// Usage: npm run site:build && npm run site:serve

import { createServer } from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
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

/**
 * Walk distDir once at startup and build a fixed url-path -> absolute-file-path map.
 * Every request is then a plain Map lookup — no request-derived string is ever passed
 * to a filesystem call, which closes the path-injection/traversal class of finding
 * entirely rather than validating a request-derived path after the fact.
 */
function buildFileMap(dir, baseUrl, map) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const url = `${baseUrl}/${entry.name}`;
    if (entry.isDirectory()) {
      buildFileMap(full, url, map);
      continue;
    }
    map.set(url, full);
    if (entry.name === "index.html") {
      map.set(`${baseUrl}/`, full);
      map.set(baseUrl === "" ? "/" : baseUrl, full);
    }
  }
  return map;
}

const FILES = buildFileMap(distDir, "", new Map());

function resolveFile(urlPath) {
  try {
    return FILES.get(decodeURIComponent(urlPath.split("?")[0])) ?? null;
  } catch {
    // Malformed percent-escape (e.g. a trailing "/%") — treat as not found rather than
    // letting the URIError crash the whole preview server.
    return null;
  }
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

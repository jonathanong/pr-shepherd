#!/usr/bin/env node
// Tiny zero-dependency static server for previewing site/dist locally.
// Usage: npm run site:build && npm run site:serve

import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { dirname } from "node:path";
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

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  let full = join(distDir, clean);
  if (!full.startsWith(distDir)) return null;
  if (clean.endsWith("/") || (existsSync(full) && statSync(full).isDirectory())) {
    full = join(full, "index.html");
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

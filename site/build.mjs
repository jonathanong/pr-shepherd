#!/usr/bin/env node
// Build site/content/**/*.md into site/dist/. Imports only marked, yaml, and node:* —
// never the package's own exports — so this keeps working under `npm ci --ignore-scripts`,
// which never builds bin/.
//
// The build fails loudly (non-zero exit) on a broken internal link, a broken docs/*.md
// link or anchor, or two emissions writing the same dist path. That is the mechanism that
// keeps this site from drifting out of sync with docs/.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLlmsFullTxt, buildLlmsTxt } from "./lib/agents.mjs";
import { createLinkResolver } from "./lib/links.mjs";
import { renderLayout } from "./lib/layout.mjs";
import { renderMarkdown } from "./lib/markdown.mjs";
import { loadPages, topLevelSections } from "./lib/pages.mjs";
import { extractHeadings } from "./lib/slug.mjs";
import { buildRobotsTxt, buildSitemap, copyAssets } from "./lib/static.mjs";

const siteDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(siteDir);
const contentDir = join(siteDir, "content");
const assetsDir = join(siteDir, "assets");
const distDir = join(siteDir, "dist");

const RESERVED_TOP_LEVEL_ROUTES = new Set([
  "assets",
  "llms.txt",
  "llms-full.txt",
  "sitemap.xml",
  "robots.txt",
]);

function readVersion() {
  return JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;
}

function assertNoReservedCollisions(pages) {
  for (const page of pages) {
    const top = page.route.split("/")[0];
    if (RESERVED_TOP_LEVEL_ROUTES.has(top)) {
      throw new Error(`content route "${page.route}" collides with a reserved top-level path`);
    }
  }
}

function createWriter(distDir) {
  const written = new Set();
  return function writeDist(relPath, contents) {
    if (written.has(relPath)) {
      throw new Error(`build produced the same output path twice: ${relPath}`);
    }
    written.add(relPath);
    const full = join(distDir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  };
}

function buildPage(page, { resolveHref, nav, siteMeta }, writeDist) {
  const ctx = { route: page.route, sourceFile: page.file, resolveHref };
  const contentHtml = renderMarkdown(page.body, ctx);
  const docsLinks = page.docs.map((d) => ({ href: resolveHref(d.path, ctx), label: d.label }));
  const html = renderLayout({ page, contentHtml, docsLinks, nav, siteMeta });

  if (page.route === "") {
    writeDist("index.html", html);
    writeDist("index.md", page.body);
    return;
  }
  writeDist(`${page.route}/index.html`, html);
  writeDist(`${page.route}/index.md`, page.body);
  writeDist(`${page.route}.md`, page.body);
}

function main() {
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  const pages = loadPages(contentDir);
  assertNoReservedCollisions(pages);

  const routes = new Set(pages.map((p) => p.route));
  const headingsByRoute = new Map(pages.map((p) => [p.route, extractHeadings(p.body)]));
  const resolveHref = createLinkResolver({ routes, headingsByRoute, repoRoot });
  const nav = topLevelSections(pages);
  const siteMeta = { version: readVersion() };
  const writeDist = createWriter(distDir);

  for (const page of pages) buildPage(page, { resolveHref, nav, siteMeta }, writeDist);

  copyAssets(assetsDir, join(distDir, "assets"));
  writeDist("llms.txt", buildLlmsTxt(pages));
  writeDist("llms-full.txt", buildLlmsFullTxt(pages));
  writeDist("sitemap.xml", buildSitemap(pages));
  writeDist("robots.txt", buildRobotsTxt());
  writeDist(".nojekyll", "");

  console.log(`site: built ${pages.length} pages -> ${distDir}`);
}

try {
  main();
} catch (error) {
  console.error(`site build failed: ${error.message}`);
  process.exitCode = 1;
}

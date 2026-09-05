// Base-path rewriting and link validation. This is the anti-drift mechanism described in
// the plan: every internal route link and every `docs/*.md` deep link is checked against
// real files/headings at build time, and the build fails loudly on a miss rather than
// shipping a dead link.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractHeadings } from "./slug.mjs";

const GITHUB_REPO = "jonathanong/pr-shepherd";
const GITHUB_BRANCH = "main";

function getBasePath() {
  return process.env.SITE_BASE ?? "";
}

function getOrigin() {
  // jonathanong.github.io permanently 301s every project-page URL to jongleberry.com
  // (the account's verified custom domain on its user Pages site), so canonical/OG/
  // sitemap URLs point straight at the domain that actually serves the content.
  return process.env.SITE_ORIGIN ?? "https://jongleberry.com";
}

/** @param {string} path an absolute site path, e.g. "/principles/" or "/style.css" */
export function withBase(path) {
  const base = getBasePath();
  if (path === "/") return base === "" ? "/" : `${base}/`;
  return `${base}${path}`;
}

export function absoluteUrl(path) {
  return `${getOrigin()}${withBase(path)}`;
}

/** Root-relative image src ("/assets/logo.svg") is base-path-rewritten directly, without
 *  route validation — image targets aren't part of the page route table, so routing them
 *  through `resolveHref` would wrongly classify "/assets/…" as a broken internal link.
 *  External URLs pass through unchanged. */
export function resolveImageSrc(href) {
  return href.startsWith("/") ? withBase(href) : href;
}

/** @param {string} route "" for the site root, otherwise e.g. "principles/never-mutate-git" */
export function routePath(route) {
  return route === "" ? "/" : `/${route}/`;
}

function docsBlobUrl(file, anchor) {
  const url = `https://github.com/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${file}`;
  return anchor ? `${url}#${anchor}` : url;
}

const DOCS_LINK_RE = /^(README\.md|CLAUDE\.md|docs\/[\w.-]+\.md)(?:#([\w-]+))?$/;

/** `#anchor` on the current page — checked against that page's own headings. */
function resolveAnchorHref(href, { route, sourceFile, headingsByRoute }) {
  const anchor = href.slice(1);
  const ownHeadings = headingsByRoute.get(route) ?? [];
  if (!ownHeadings.some((h) => h.slug === anchor)) {
    throw new Error(`${sourceFile}: broken same-page anchor "${href}"`);
  }
  return href;
}

/** `/route/` or `/route/#anchor` — checked against the site's own route table. */
function resolveInternalHref(href, { sourceFile, routes, headingsByRoute }) {
  const [routePart, anchor] = href.slice(1).split("#");
  const route = routePart.replace(/\/$/, "");
  if (!routes.has(route)) {
    throw new Error(`${sourceFile}: broken internal link "${href}" (no such page)`);
  }
  if (anchor && !(headingsByRoute.get(route) ?? []).some((h) => h.slug === anchor)) {
    throw new Error(`${sourceFile}: broken internal anchor "${href}"`);
  }
  return withBase(routePath(route)) + (anchor ? `#${anchor}` : "");
}

/** `docs/<file>.md`, `README.md`, or `CLAUDE.md`, optionally `#anchor` — rewritten to a
 *  canonical GitHub blob URL. Returns `null` when `href` doesn't match this shape at all. */
function resolveDocsHref(href, { sourceFile, repoRoot, headingsForDoc }) {
  const docsMatch = DOCS_LINK_RE.exec(href);
  if (!docsMatch) return null;

  const [, file, anchor] = docsMatch;
  if (!existsSync(join(repoRoot, file))) {
    throw new Error(`${sourceFile}: broken docs link "${href}" (${file} does not exist)`);
  }
  if (anchor && !headingsForDoc(file).some((h) => h.slug === anchor)) {
    throw new Error(`${sourceFile}: broken docs anchor "${href}" in ${file}`);
  }
  return docsBlobUrl(file, anchor);
}

// Matches `[text](href)`, `![alt](href)`, and `[text](href "title")` — the only link
// forms used in this site's content (no reference-style links, no bare autolinks).
// Single quantified group over "not )" — the href/title split happens in the callback,
// not in the regex, so there's no optional trailing group for the engine to backtrack
// into against the primary group's boundary.
const MARKDOWN_LINK_RE = /(!?\[[^\]]*\])\(([^)]*)\)/g;

/**
 * Rewrite every link target in raw markdown through `resolveHref`, so the agent-facing
 * `.md` twins and `llms-full.txt` carry the same base-path-aware, docs-blob-rewritten
 * hrefs as the rendered HTML — not the raw, context-free targets as written in content.
 * Without this, a root-relative link like `/principles/` is correct in HTML (resolved
 * through `withBase`) but wrong when copied verbatim into a `.md` file served under a
 * base path: resolved against that document's own URL, a leading `/` lands at the
 * domain root, not the deployed subpath.
 * @param {string} body
 * @param {{ sourceFile: string, route: string }} ctx
 * @param {(href: string, ctx: object) => string} resolveHref
 */
export function rewriteMarkdownLinks(body, ctx, resolveHref) {
  return body.replace(MARKDOWN_LINK_RE, (_match, textPart, inner) => {
    const spaceAt = inner.search(/\s/);
    const href = spaceAt === -1 ? inner : inner.slice(0, spaceAt);
    const titlePart = spaceAt === -1 ? "" : inner.slice(spaceAt);
    // An image token (`![alt](...)`) is not a link: its target is base-path-rewritten
    // like markdown.mjs's HTML image renderer, not validated against the route table.
    const resolved = textPart.startsWith("!") ? resolveImageSrc(href) : resolveHref(href, ctx);
    return `${textPart}(${resolved}${titlePart})`;
  });
}

/**
 * @param {object} opts
 * @param {Set<string>} opts.routes valid page routes ("" included for the root)
 * @param {Map<string, {depth:number,text:string,slug:string}[]>} opts.headingsByRoute
 * @param {string} opts.repoRoot absolute path to the repository root (two levels above site/)
 */
export function createLinkResolver({ routes, headingsByRoute, repoRoot }) {
  const docsHeadingCache = new Map();

  function headingsForDoc(relFile) {
    if (docsHeadingCache.has(relFile)) return docsHeadingCache.get(relFile);
    const headings = extractHeadings(readFileSync(join(repoRoot, relFile), "utf8"));
    docsHeadingCache.set(relFile, headings);
    return headings;
  }

  /**
   * @param {string} href as written in site/content markdown
   * @param {{ sourceFile: string, route: string }} ctx
   * @returns {string} the href to emit into rendered HTML
   */
  return function resolveHref(href, ctx) {
    if (/^(https?:|mailto:)/.test(href)) return href;
    if (href.startsWith("#")) return resolveAnchorHref(href, { ...ctx, headingsByRoute });
    if (href.startsWith("/")) return resolveInternalHref(href, { ...ctx, routes, headingsByRoute });

    const docsHref = resolveDocsHref(href, { ...ctx, repoRoot, headingsForDoc });
    if (docsHref !== null) return docsHref;

    throw new Error(
      `${ctx.sourceFile}: unrecognized link target "${href}" — use "/route/", "#anchor", ` +
        `"docs/<file>.md", or an absolute http(s) URL`,
    );
  };
}

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
  return process.env.SITE_ORIGIN ?? "https://jonathanong.github.io";
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

/** @param {string} route "" for the site root, otherwise e.g. "principles/never-mutate-git" */
export function routePath(route) {
  return route === "" ? "/" : `/${route}/`;
}

function docsBlobUrl(file, anchor) {
  const url = `https://github.com/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${file}`;
  return anchor ? `${url}#${anchor}` : url;
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

    if (href.startsWith("#")) {
      const anchor = href.slice(1);
      const ownHeadings = headingsByRoute.get(ctx.route) ?? [];
      if (!ownHeadings.some((h) => h.slug === anchor)) {
        throw new Error(`${ctx.sourceFile}: broken same-page anchor "${href}"`);
      }
      return href;
    }

    if (href.startsWith("/")) {
      const [routePart, anchor] = href.slice(1).split("#");
      const route = routePart.replace(/\/$/, "");
      if (!routes.has(route)) {
        throw new Error(`${ctx.sourceFile}: broken internal link "${href}" (no such page)`);
      }
      if (anchor) {
        const targetHeadings = headingsByRoute.get(route) ?? [];
        if (!targetHeadings.some((h) => h.slug === anchor)) {
          throw new Error(`${ctx.sourceFile}: broken internal anchor "${href}"`);
        }
      }
      return withBase(routePath(route)) + (anchor ? `#${anchor}` : "");
    }

    const docsMatch = /^(README\.md|CLAUDE\.md|docs\/[\w.-]+\.md)(?:#([\w-]+))?$/.exec(href);
    if (docsMatch) {
      const [, file, anchor] = docsMatch;
      if (!existsSync(join(repoRoot, file))) {
        throw new Error(`${ctx.sourceFile}: broken docs link "${href}" (${file} does not exist)`);
      }
      if (anchor && !headingsForDoc(file).some((h) => h.slug === anchor)) {
        throw new Error(`${ctx.sourceFile}: broken docs anchor "${href}" in ${file}`);
      }
      return docsBlobUrl(file, anchor);
    }

    throw new Error(
      `${ctx.sourceFile}: unrecognized link target "${href}" — use "/route/", "#anchor", ` +
        `"docs/<file>.md", or an absolute http(s) URL`,
    );
  };
}

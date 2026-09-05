// Discover site/content/**/*.md, parse frontmatter, and build the page + route table.
//
// Route derivation mirrors a conventional file-based router:
//   content/index.md                     -> route ""              (site root)
//   content/principles/index.md          -> route "principles"    (section index)
//   content/principles/never-mutate.md   -> route "principles/never-mutate"

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { parse as parseYaml } from "yaml";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) found.push(...walk(full));
    else if (extname(entry) === ".md") found.push(full);
  }
  return found;
}

function routeForFile(contentDir, file) {
  const rel = relative(contentDir, file).replace(/\\/g, "/");
  const withoutExt = rel.replace(/\.md$/, "");
  if (withoutExt === "index") return "";
  if (withoutExt.endsWith("/index")) return withoutExt.slice(0, -"/index".length);
  return withoutExt;
}

/**
 * @param {string} contentDir absolute path to site/content
 * @returns {Array<{
 *   file: string, route: string, title: string, description: string,
 *   order: number, docs: Array<{path: string, label: string}>, body: string
 * }>}
 */
export function loadPages(contentDir) {
  const pages = walk(contentDir).map((file) => {
    const raw = readFileSync(file, "utf8");
    const match = FRONTMATTER_RE.exec(raw);
    if (!match) throw new Error(`site content is missing frontmatter: ${file}`);

    const frontmatter = parseYaml(match[1]) ?? {};
    if (!frontmatter.title) throw new Error(`site content is missing a title: ${file}`);
    if (!frontmatter.description) {
      throw new Error(`site content is missing a description: ${file}`);
    }

    return {
      file,
      route: routeForFile(contentDir, file),
      title: frontmatter.title,
      description: frontmatter.description,
      order: frontmatter.order ?? 0,
      docs: frontmatter.docs ?? [],
      body: raw.slice(match[0].length),
    };
  });

  pages.sort((a, b) => a.route.localeCompare(b.route));

  const seenRoutes = new Set();
  for (const page of pages) {
    const key = page.route || "/";
    if (seenRoutes.has(key)) throw new Error(`duplicate site route: ${key} (${page.file})`);
    seenRoutes.add(key);
  }

  return pages;
}

/** Top-level section index pages (e.g. "principles"), ordered for the nav bar. */
export function topLevelSections(pages) {
  return pages
    .filter((page) => page.route !== "" && !page.route.includes("/"))
    .sort((a, b) => a.order - b.order || a.route.localeCompare(b.route));
}

/** Pages that belong to a given top-level section, ordered for that section's sidebar. */
export function pagesInSection(pages, section) {
  return pages
    .filter((page) => page.route.startsWith(`${section}/`))
    .sort((a, b) => a.order - b.order || a.route.localeCompare(b.route));
}

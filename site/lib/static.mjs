// Static assets, sitemap.xml, and robots.txt.

import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { absoluteUrl, routePath } from "./links.mjs";

/** Copy every non-HTML file in site/assets into dist/assets. og.html is a render source
 *  for og.png, not something served directly, so it is excluded. */
export function copyAssets(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    if (entry.endsWith(".html")) continue;
    const src = join(srcDir, entry);
    if (statSync(src).isDirectory()) continue;
    copyFileSync(src, join(destDir, entry));
  }
}

export function buildSitemap(pages) {
  const urls = pages
    .map((p) => `  <url><loc>${absoluteUrl(routePath(p.route))}</loc></url>`)
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );
}

export function buildRobotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl("/sitemap.xml")}\n`;
}

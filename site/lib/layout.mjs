// The HTML shell: <head> metadata (including agent-facing markdown alternate + JSON-LD),
// header nav, the rendered article, a "Canonical spec" footer linking into docs/, and the
// site footer. One function in, one HTML string out.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { absoluteUrl, routePath, withBase } from "./links.mjs";

const NO_FOUC_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");
if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);
}catch(e){}})();`;

// Inlined (not loaded via <img src>) so its `stroke="currentColor"` / `fill="currentColor"`
// resolve against this page's own color, not an external SVG document's default black —
// an <img>-referenced SVG renders in an isolated document with nothing to inherit from,
// which made the mark nearly invisible on the dark theme.
const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const INLINE_LOGO_SVG = readFileSync(join(ASSETS_DIR, "logo.svg"), "utf8").trim();

function escapeAttr(value) {
  return String(value).replace(/"/g, "&quot;");
}

function jsonLd(page, siteMeta) {
  const url = absoluteUrl(routePath(page.route));
  if (page.route === "") {
    return {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "pr-shepherd",
      description: page.description,
      url,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Node.js, macOS, Linux, Windows",
      softwareVersion: siteMeta.version,
      license: "https://opensource.org/licenses/MIT",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    };
  }
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: page.title,
    description: page.description,
    url,
    isPartOf: { "@type": "WebSite", name: "pr-shepherd", url: absoluteUrl("/") },
  };
}

function renderNav(nav, page) {
  const items = nav
    .map((item) => {
      const inSection = page.route === item.route || page.route.startsWith(`${item.route}/`);
      const current = inSection ? ' aria-current="page"' : "";
      return `<a href="${withBase(routePath(item.route))}"${current}>${item.title}</a>`;
    })
    .join("\n");
  return (
    `${items}\n` +
    `<a href="https://github.com/jonathanong/pr-shepherd/tree/main/docs" ` +
    `target="_blank" rel="noopener noreferrer">Docs</a>\n` +
    `<a href="https://github.com/jonathanong/pr-shepherd" target="_blank" ` +
    `rel="noopener noreferrer">GitHub</a>`
  );
}

function renderDocsFooter(docsLinks) {
  if (docsLinks.length === 0) return "";
  const items = docsLinks
    .map(
      (d) =>
        `<li><a href="${d.href}" target="_blank" rel="noopener noreferrer">${d.label}</a></li>`,
    )
    .join("\n");
  return `<aside class="canonical-spec"><h2>Canonical spec</h2><ul>${items}</ul></aside>`;
}

/**
 * @param {object} args
 * @param {{route:string,title:string,description:string}} args.page
 * @param {string} args.contentHtml
 * @param {Array<{href:string,label:string}>} args.docsLinks resolved (already validated) links
 * @param {Array<{route:string,title:string}>} args.nav
 * @param {{version:string}} args.siteMeta
 */
export function renderLayout({ page, contentHtml, docsLinks, nav, siteMeta }) {
  const canonical = absoluteUrl(routePath(page.route));
  const ogImage = absoluteUrl("/assets/og.png");
  const ld = JSON.stringify(jsonLd(page, siteMeta));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeAttr(page.title)} · pr-shepherd</title>
<meta name="description" content="${escapeAttr(page.description)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="text/markdown" href="index.md">
<link rel="icon" href="${withBase("/assets/favicon.svg")}" type="image/svg+xml">
<link rel="stylesheet" href="${withBase("/assets/style.css")}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="pr-shepherd">
<meta property="og:title" content="${escapeAttr(page.title)}">
<meta property="og:description" content="${escapeAttr(page.description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<script>${NO_FOUC_THEME_SCRIPT}</script>
<script type="application/ld+json">${ld}</script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <a class="brand" href="${withBase("/")}">
    <span class="brand-mark">${INLINE_LOGO_SVG}</span>
    <span>pr-shepherd</span>
  </a>
  <nav class="site-nav">${renderNav(nav, page)}</nav>
  <button type="button" class="theme-toggle" aria-label="Toggle color theme">◐</button>
</header>
<main id="main">
<article class="page">
${contentHtml}
${renderDocsFooter(docsLinks)}
</article>
</main>
<footer class="site-footer">
  <p>pr-shepherd v${siteMeta.version} · MIT licensed ·
  <a href="https://github.com/jonathanong/pr-shepherd" target="_blank" rel="noopener noreferrer">GitHub</a> ·
  <a href="https://www.npmjs.com/package/pr-shepherd" target="_blank" rel="noopener noreferrer">npm</a> ·
  <a href="${withBase("/llms.txt")}">llms.txt</a></p>
</footer>
<script src="${withBase("/assets/theme.js")}"></script>
</body>
</html>
`;
}

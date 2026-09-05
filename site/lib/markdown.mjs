// Render page markdown to HTML with a marked.js renderer that:
//   - assigns GitHub-compatible heading ids (so #anchor links behave the same as on GitHub)
//   - routes every link through the shared resolver, which base-path-rewrites internal
//     links and rewrites `docs/*.md` links to canonical GitHub blob URLs — or throws.

import { marked } from "marked";
import { githubSlug } from "./slug.mjs";
import { resolveImageSrc } from "./links.mjs";

/**
 * @param {string} body raw markdown for one page
 * @param {{ route: string, sourceFile: string, resolveHref: (href: string, ctx: object) => string }} ctx
 * @returns {string} rendered HTML
 */
export function renderMarkdown(body, ctx) {
  const seen = new Map();
  const linkErrors = [];
  const renderer = new marked.Renderer();

  renderer.heading = function heading({ tokens, depth }) {
    const html = this.parser.parseInline(tokens);
    const plain = this.parser.parseInline(tokens, this.parser.textRenderer);
    const slug = githubSlug(plain, seen);
    return (
      `<h${depth} id="${slug}">${html}` +
      `<a class="anchor" href="#${slug}" aria-hidden="true" tabindex="-1">#</a></h${depth}>\n`
    );
  };

  renderer.link = function link({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    let resolved;
    try {
      resolved = ctx.resolveHref(href, ctx);
    } catch (error) {
      // Thrown from inside a marked renderer callback, this would otherwise get marked's
      // own "please report this to marked" boilerplate appended to it. Record it and keep
      // rendering so every broken link on the page is reported, not just the first.
      linkErrors.push(error.message);
      return text;
    }
    const titleAttr = title ? ` title="${title}"` : "";
    const external = /^https?:/.test(resolved);
    const relAttr = external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${resolved}"${titleAttr}${relAttr}>${text}</a>`;
  };

  renderer.image = function image({ href, title, text }) {
    const src = resolveImageSrc(href);
    const titleAttr = title ? ` title="${title}"` : "";
    return `<img src="${src}" alt="${text}"${titleAttr} loading="lazy">`;
  };

  const html = marked.parse(body, { renderer, gfm: true });
  if (linkErrors.length > 0) throw new Error(linkErrors.join("\n"));
  return html;
}

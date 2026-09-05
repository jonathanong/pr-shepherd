// GitHub-compatible heading slugger. One implementation shared by:
//   - markdown.mjs, which assigns the same ids to our own rendered <h2>/<h3> tags
//   - links.mjs, which validates `docs/*.md#anchor` links against real GitHub anchors
// Keeping a single algorithm is what lets on-page anchors and cross-repo docs anchors
// both be checked the same way.

/**
 * @param {string} text
 * @param {Map<string, number>} [seen] per-scope counter for duplicate headings
 * @returns {string}
 */
export function githubSlug(text, seen) {
  let slug = text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");

  if (seen) {
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    if (count > 0) slug = `${slug}-${count}`;
  }

  return slug;
}

/**
 * Extract ATX headings (`## Heading`) from raw markdown without a full parse.
 * Used to validate same-page and cross-file anchor links.
 * @param {string} markdown
 * @returns {{ depth: number, text: string, slug: string }[]}
 */
export function extractHeadings(markdown) {
  const seen = new Map();
  const headings = [];

  for (const line of markdown.split("\n")) {
    const match = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (!match) continue;
    const depth = match[1].length;
    const text = match[2].replace(/[`*_]/g, "").trim();
    headings.push({ depth, text, slug: githubSlug(text, seen) });
  }

  return headings;
}

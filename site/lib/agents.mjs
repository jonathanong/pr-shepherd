// Agent-facing output: llms.txt (the llmstxt.org convention — a linked index with
// one-line descriptions) and llms-full.txt (every page's raw markdown concatenated).
// Both exist so an agent can orient without crawling rendered HTML.

import { absoluteUrl, routePath } from "./links.mjs";
import { pagesInSection, topLevelSections } from "./pages.mjs";

const SUMMARY =
  "pr-shepherd gathers all context for a GitHub pull request in one poll and returns " +
  "exactly one deterministic next action for a calling agent: WAIT, MARK_READY, FIX_CODE, " +
  "MERGE, CANCEL, or ESCALATE. It never classifies signal vs. noise and never mutates git " +
  "itself — the calling agent decides, and Shepherd only emits what to run.";

function sectionLabel(page) {
  return page.title;
}

export function buildLlmsTxt(pages) {
  const root = pages.find((p) => p.route === "");
  const lines = ["# pr-shepherd", "", `> ${SUMMARY}`, ""];

  if (root) {
    lines.push(
      "## Start here",
      "",
      `- [${root.title}](${absoluteUrl(routePath(""))}): ${root.description}`,
      "",
    );
  }

  for (const section of topLevelSections(pages)) {
    const childLines = pagesInSection(pages, section.route).map(
      (child) => `- [${child.title}](${absoluteUrl(routePath(child.route))}): ${child.description}`,
    );
    lines.push(
      `## ${sectionLabel(section)}`,
      "",
      `- [${section.title}](${absoluteUrl(routePath(section.route))}): ${section.description}`,
      ...childLines,
      "",
    );
  }

  lines.push(
    "## Full specification",
    "",
    "- [docs/](https://github.com/jonathanong/pr-shepherd/tree/main/docs): " +
      "the canonical, exhaustive spec this site links out to for every claim.",
    "",
  );

  return lines.join("\n");
}

/** @param {Map<string, string>} rewrittenBodies route -> body with hrefs rewritten
 *  through the link resolver (see rewriteMarkdownLinks) — not the raw content bodies. */
export function buildLlmsFullTxt(pages, rewrittenBodies) {
  const ordered = [...pages].sort((a, b) => a.route.localeCompare(b.route));
  return ordered
    .map((page) => {
      const url = absoluteUrl(routePath(page.route));
      const body = (rewrittenBodies.get(page.route) ?? page.body).trim();
      return `# ${page.title}\n\nSource: ${url}\n\n${body}\n`;
    })
    .join("\n---\n\n");
}

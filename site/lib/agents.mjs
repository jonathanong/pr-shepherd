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
    lines.push("## Start here", "");
    lines.push(`- [${root.title}](${absoluteUrl(routePath(""))}): ${root.description}`);
    lines.push("");
  }

  for (const section of topLevelSections(pages)) {
    lines.push(`## ${sectionLabel(section)}`, "");
    lines.push(
      `- [${section.title}](${absoluteUrl(routePath(section.route))}): ${section.description}`,
    );
    for (const child of pagesInSection(pages, section.route)) {
      lines.push(
        `- [${child.title}](${absoluteUrl(routePath(child.route))}): ${child.description}`,
      );
    }
    lines.push("");
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

export function buildLlmsFullTxt(pages) {
  const ordered = [...pages].sort((a, b) => a.route.localeCompare(b.route));
  return ordered
    .map((page) => {
      const url = absoluteUrl(routePath(page.route));
      return `# ${page.title}\n\nSource: ${url}\n\n${page.body.trim()}\n`;
    })
    .join("\n---\n\n");
}

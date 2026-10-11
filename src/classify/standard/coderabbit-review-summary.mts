import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const HEADING = /^\*\*Actionable comments posted: \d+\*\*\n/;
const PROMPT_BLOCK =
  /\n<details>\n<summary>🤖 Prompt to fix review comments<\/summary>\n\n```\n([\s\S]*?)\n```\n\n<\/details>\n/;
const REVIEW_INFO_BLOCK = /\n<details>\n<summary>ℹ️ Review info<\/summary>\n[\s\S]*<\/details>\n/;
const AUTOFIX_BLOCK = /\n<!-- autofix_checkbox_start -->[\s\S]*?<!-- autofix_checkbox_end -->\n/;
/** Sections that carry findings only in the summary body, never in an inline thread. */
const BODY_ONLY_FINDINGS =
  /\[!CAUTION\]|Outside diff range comments|Nitpick comments|Duplicate comments|Additional comments|Outside diff comments:/;

/**
 * CodeRabbit review summaries that only count and re-prompt their inline threads. The threads
 * carry the findings, so the summary adds nothing. Any outside-diff, nitpick, duplicate or
 * other body-only section keeps the summary visible.
 */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["coderabbitai"], ["review-summary"])) return null;
  const body = `${item.body.trim()}\n`;
  if (!HEADING.test(body) || BODY_ONLY_FINDINGS.test(body)) return null;
  const prompt = body.match(PROMPT_BLOCK)?.[1];
  if (prompt !== undefined && !prompt.includes("\nInline comments:\n")) return null;
  const rest = body
    .replace(HEADING, "\n")
    .replace(AUTOFIX_BLOCK, "\n")
    .replace(PROMPT_BLOCK, "\n")
    .replace(REVIEW_INFO_BLOCK, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^---$/gm, "");
  if (rest.trim() !== "") return null;
  return {
    autoResolve: true,
    suppress: true,
    reason: "CodeRabbit review summary that only repeats its inline threads",
  };
};

export default rule;

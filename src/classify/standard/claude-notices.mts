import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

/** The title line, with the optional inline spinner image the action appends. */
const TITLE = "Claude Code is working…(?: <img [^>\\n]*>)?";

/** The to-do list the action shows while it works: a heading and only checkbox lines. */
const TODO_LIST = "#{2,4} To-?[Dd]o [Ll]ist:?\\n(?:\\n?- \\[[ xX]\\] [^\\n]+)+";

/** The run link the action appends: `[View job run](…/actions/runs/N)`. */
const JOB_LINK =
  "\\[View job(?: run)?\\]\\(https:\\/\\/[^\\s)]+\\/actions\\/runs\\/\\d+[^\\s)]*\\)";

/**
 * The whole comment is the title, then optionally the intro sentence, the to-do list and a rule
 * line, then optionally the run link. Any other text, such as the finished review, does not match.
 */
const PLACEHOLDER = new RegExp(
  `^${TITLE}(?:\\n\\n(?:I'll analyze this and get back to you\\.|${TODO_LIST}))*(?:\\n\\n---)?(?:\\n\\n${JOB_LINK})?$`,
);

/**
 * The `@claude` mention bot's in-progress placeholder comment (claude-code-action). The action
 * edits this same comment into its result, so the rule only suppresses it and never auto-resolves:
 * minimizing the placeholder would leave the finished review minimized. Once the comment is
 * edited its body no longer matches, and Shepherd surfaces it as an edited comment.
 */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["claude", "github-actions"], ["pr-comment"])) return null;
  if (!PLACEHOLDER.test(item.body.trim())) return null;
  return { suppress: true, reason: "Claude Code in-progress placeholder (edited into its result)" };
};

export default rule;

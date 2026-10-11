import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const ABOUT_BLOCK =
  /\n\n<details> <summary>ℹ️ About Codex in GitHub<\/summary>[\s\S]*?<\/details>$/;

const ENVELOPE =
  /^### 💡 Codex Review\n\nHere are some automated review suggestions for this pull request\.\n\n\*\*Reviewed commit:\*\* `[a-f0-9]+`$/;

/**
 * The Codex review summary that only introduces its inline threads. A summary that carries a
 * finding in its own body (for example, a permalink to a line outside the diff) stays visible.
 */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["chatgpt-codex-connector"], ["review-summary"])) return null;
  const content = item.body.trim().replace(ABOUT_BLOCK, "").trim();
  if (!ENVELOPE.test(content)) return null;
  return {
    autoResolve: true,
    suppress: true,
    reason: "Codex review summary that only introduces its inline threads",
  };
};

export default rule;

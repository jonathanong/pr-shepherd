import type { ClassifyRule } from "pr-shepherd/classify";

const rule: ClassifyRule = (item) => {
  if (item.author !== "chatgpt-codex-connector") return null;
  if (item.kind !== "review-summary" && item.kind !== "pr-comment") return null;
  if (!/Codex usage limits have been reached/i.test(item.body)) return null;
  return { autoResolve: true, suppress: true, reason: "codex usage limit notice" };
};

export default rule;

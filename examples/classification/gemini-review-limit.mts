import type { ClassifyRule } from "pr-shepherd/classify";

const rule: ClassifyRule = (item) => {
  if (item.author !== "gemini-code-assist") return null;
  if (item.kind !== "review-summary" && item.kind !== "pr-comment") return null;
  if (!/Review limit reached/i.test(item.body)) return null;
  return { autoResolve: true, suppress: true, reason: "gemini review limit" };
};

export default rule;

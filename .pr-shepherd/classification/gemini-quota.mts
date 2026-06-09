import type { ClassifyRule } from "pr-shepherd/classify";

const rule: ClassifyRule = (item) => {
  if (item.author !== "gemini-code-assist") return null;
  if (item.kind !== "review-summary" && item.kind !== "pr-comment") return null;
  if (!/You have reached your daily quota limit/i.test(item.body)) return null;
  return { autoResolve: true, suppress: true, reason: "gemini quota notice" };
};

export default rule;

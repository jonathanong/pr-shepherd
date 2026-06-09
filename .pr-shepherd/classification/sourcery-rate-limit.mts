import type { ClassifyRule } from "pr-shepherd/classify";

const rule: ClassifyRule = (item) => {
  if (item.author !== "sourcery-ai") return null;
  if (item.kind !== "review-summary" && item.kind !== "pr-comment") return null;
  if (!/reached your weekly rate limit/i.test(item.body)) return null;
  return { autoResolve: true, suppress: true, reason: "sourcery rate-limit notice" };
};

export default rule;

import type { ClassifyRule } from "pr-shepherd/classify";

const rule: ClassifyRule = (item) => {
  if (item.author !== "coderabbitai") return null;
  if (item.kind !== "pr-comment") return null;
  if (!/Currently processing new changes in this PR/i.test(item.body)) return null;
  return { autoResolve: true, suppress: true, reason: "coderabbit review-in-progress notice" };
};

export default rule;

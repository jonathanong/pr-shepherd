import type { ClassifyRule } from "pr-shepherd/classify";

const rule: ClassifyRule = (item) => {
  if (item.author !== "coderabbitai") return null;
  if (!/Reviews paused/i.test(item.body)) return null;
  return { autoResolve: true, suppress: true, reason: "coderabbit paused" };
};

export default rule;

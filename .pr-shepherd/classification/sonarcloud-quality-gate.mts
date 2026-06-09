import type { ClassifyRule } from "pr-shepherd/classify";

const rule: ClassifyRule = (item) => {
  if (item.author !== "sonarqubecloud") return null;
  if (item.kind !== "pr-comment") return null;
  return { autoResolve: true, suppress: true, reason: "sonarcloud quality-gate summary" };
};

export default rule;

import type { ClassifyRule } from "pr-shepherd/classify";

const rule: ClassifyRule = (item) => {
  if (item.author !== "github-advanced-security") return null;
  if (!/SONAR_ISSUE_KEY/i.test(item.body)) return null;
  return { autoResolve: true, suppress: true, reason: "github-advanced-security SonarCloud relay" };
};

export default rule;

import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const WELCOME =
  /^## Welcome to \[Codecov\]\(https:\/\/codecov\.io[^\s)]*\) :tada:\n\nOnce you merge this PR into your default branch, you're all set! Codecov will compare coverage reports and display results in all future pull requests\.\n\nThanks for integrating Codecov - We've got you covered :open_umbrella:$/;

/** Codecov's coverage report and first-run welcome. Coverage gates still report through checks. */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["codecov"], ["pr-comment"])) return null;
  const body = item.body.trim();
  if (WELCOME.test(body)) {
    return { autoResolve: true, suppress: true, reason: "Codecov welcome notice" };
  }
  if (!/^#{1,6}\s*\[?Codecov\b/i.test(body)) return null;
  return { autoResolve: true, suppress: true, reason: "Codecov coverage report" };
};

export default rule;

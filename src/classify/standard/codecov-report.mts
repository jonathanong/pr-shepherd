import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

/** Codecov's coverage report comment. Coverage gates still report through their status checks. */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["codecov"], ["pr-comment"])) return null;
  if (!/^#{1,6}\s*\[?Codecov\b/i.test(item.body.trimStart())) return null;
  return { autoResolve: true, suppress: true, reason: "Codecov coverage report" };
};

export default rule;

import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

/** Kilo Code's "No Issues Found" report. */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["kilo-code-bot"], ["pr-comment", "review-summary"])) return null;
  if (!/No Issues Found/i.test(item.body)) return null;
  return { autoResolve: true, suppress: true, reason: "Kilo Code no-issues report" };
};

export default rule;

import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const PLAIN_STATUS = /^Status: ✅ No Issues Found \| Recommendation: Merge$/;
const REVIEW_REPORT =
  /^## Code Review Summary\n\n\*\*Status:\*\* No Issues Found \| \*\*Recommendation:\*\* Merge(?:\n\n### Files Reviewed \((\d+) files\)\n((?:- `[^`\n]+`(?:\n|$))+))?$/;

/** Complete Kilo Code no-issues status or report with a file list and no extra prose. */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["kilo-code-bot"], ["pr-comment"])) return null;
  const body = item.body.trim();
  if (!PLAIN_STATUS.test(body)) {
    const report = body.match(REVIEW_REPORT);
    if (!report) return null;
    if (report[1] !== undefined) {
      const listed = report[2]!.trimEnd().split("\n").length;
      if (listed !== Number(report[1])) return null;
    }
  }
  return { autoResolve: true, suppress: true, reason: "Kilo Code no-issues report" };
};

export default rule;

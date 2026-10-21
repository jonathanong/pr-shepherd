import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const PLAIN_STATUS = /^Status: ✅ No Issues Found \| Recommendation: Merge$/;
const REVIEW_REPORT =
  /^## Code Review Summary\n\n\*\*Status:\*\* No Issues Found \| \*\*Recommendation:\*\* Merge(?:\n\n### Files Reviewed \((\d+) files\)\n((?:- `[^`\n]+`(?:\n|$))+))?$/;

/**
 * The marked report: a no-issues status, an optional plain overview (see `isPlainOverview`), the
 * collapsed file list, and `kilo-*` usage footers. Any other status, such as "N Issues Found",
 * does not match, and Kilo rewrites this same comment when a later push finds issues. A stray
 * `EOF` line, left by some models before the footer, is tolerated.
 */
const MARKED_REPORT =
  /^<!-- kilo-review -->\n\n?## Code Review Summary\n\n\*\*Status:\*\* No (?:New )?Issues Found \| \*\*Recommendation:\*\* Merge(?: \([^)\n]*\))?\n\n([\s\S]*?\n)?<details>\n<summary><b>Files Reviewed \([^)\n]*\)<\/b><\/summary>\n(?:(?!<details>)[\s\S])*?<\/details>\n+(?:EOF\n+)?---\n(?:<!-- kilo-[a-z-]+ -->\n<sub>[^\n]*<\/sub>(?:\n|$))+$/;

const BILLING =
  /^<!-- kilo-billing-notice -->\n\*\*Kilo Code Review could not run — your account is out of credits\.\*\*\n\n\[Add credits\]\(https:\/\/app\.kilo\.ai\/[^\s)]*\) or \[switch to a free model\]\(https:\/\/app\.kilo\.ai\/[^\s)]*\) to enable reviews on this change\.$/;

/**
 * True when the overview is only prose and lists, optionally under `### Overview`. Any other
 * heading, HTML block, or table could carry a finding, so it keeps the report visible.
 */
function isPlainOverview(overview: string | undefined): boolean {
  return (overview ?? "")
    .split("\n")
    .every((line) => line === "### Overview" || !/^\s*(?:#|<|\|)/.test(line));
}

/** True for the marked report when its overview is plain. */
function isMarkedReport(body: string): boolean {
  const report = body.match(MARKED_REPORT);
  return report != null && isPlainOverview(report[1]);
}

/** True for the unmarked report when its file count agrees with the listed files. */
function isConsistentReport(body: string): boolean {
  const report = body.match(REVIEW_REPORT);
  if (!report) return false;
  if (report[1] === undefined) return true;
  return report[2]!.trimEnd().split("\n").length === Number(report[1]);
}

/** Complete Kilo Code no-issues reports and its out-of-credits notice, with no extra findings. */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["kilo-code-bot"], ["pr-comment"])) return null;
  const body = item.body.trim();
  if (BILLING.test(body)) {
    return { autoResolve: true, suppress: true, reason: "Kilo Code out-of-credits notice" };
  }
  if (!PLAIN_STATUS.test(body) && !isMarkedReport(body) && !isConsistentReport(body)) {
    return null;
  }
  return { autoResolve: true, suppress: true, reason: "Kilo Code no-issues report" };
};

export default rule;

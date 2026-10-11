import type { ClassifyRule } from "../types.mts";
import coderabbitNotices from "./coderabbit-notices.mts";
import coderabbitReviewSummary from "./coderabbit-review-summary.mts";
import codecovReport from "./codecov-report.mts";
import codexNotices from "./codex-notices.mts";
import codexReviewSummary from "./codex-review-summary.mts";
import dependabotNotices from "./dependabot-notices.mts";
import geminiNotices from "./gemini-notices.mts";
import kiloNoIssues from "./kilo-no-issues.mts";
import sourceryNotices from "./sourcery-notices.mts";

/** Bundled classification rules that `classify.standard` can enable by name. */
export const STANDARD_RULES: Readonly<Record<string, ClassifyRule>> = {
  "coderabbit-notices": coderabbitNotices,
  "coderabbit-review-summary": coderabbitReviewSummary,
  "codecov-report": codecovReport,
  "codex-notices": codexNotices,
  "codex-review-summary": codexReviewSummary,
  "dependabot-notices": dependabotNotices,
  "gemini-notices": geminiNotices,
  "kilo-no-issues": kiloNoIssues,
  "sourcery-notices": sourceryNotices,
};

export const STANDARD_RULE_NAMES: readonly string[] = Object.keys(STANDARD_RULES);

import type { ClassifyRule } from "../types.mts";
import claudeNotices from "./claude-notices.mts";
import coderabbitNotices from "./coderabbit-notices.mts";
import codecovReport from "./codecov-report.mts";
import codexNotices from "./codex-notices.mts";
import dependabotNotices from "./dependabot-notices.mts";
import dependencyReviewNoIssues from "./dependency-review-no-issues.mts";
import geminiNotices from "./gemini-notices.mts";
import kiloNoIssues from "./kilo-no-issues.mts";
import snykNoIssues from "./snyk-no-issues.mts";
import socketReports from "./socket-reports.mts";
import sonarqubeGatePassed from "./sonarqube-gate-passed.mts";
import sourceryNotices from "./sourcery-notices.mts";
import sourceryReviewGuide from "./sourcery-review-guide.mts";

/**
 * Bundled classification rules that `classify.standard` can enable by name.
 * Rules match conversation comments (`pr-comment`) only, except `coderabbit-notices` also
 * suppresses CodeRabbit's chat rate-limit notice on review-thread replies (`review-thread-reply`).
 */
export const STANDARD_RULES: Readonly<Record<string, ClassifyRule>> = {
  "claude-notices": claudeNotices,
  "coderabbit-notices": coderabbitNotices,
  "codecov-report": codecovReport,
  "codex-notices": codexNotices,
  "dependabot-notices": dependabotNotices,
  "dependency-review-no-issues": dependencyReviewNoIssues,
  "gemini-notices": geminiNotices,
  "kilo-no-issues": kiloNoIssues,
  "snyk-no-issues": snykNoIssues,
  "socket-reports": socketReports,
  "sonarqube-gate-passed": sonarqubeGatePassed,
  "sourcery-notices": sourceryNotices,
  "sourcery-review-guide": sourceryReviewGuide,
};

export const STANDARD_RULE_NAMES: readonly string[] = Object.keys(STANDARD_RULES);

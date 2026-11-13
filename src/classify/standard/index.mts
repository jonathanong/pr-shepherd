import type { ClassifyRule } from "../types.mts";
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

/**
 * Bundled classification rules that `classify.standard` can enable by name.
 * Each rule matches conversation comments (`pr-comment`) only.
 */
export const STANDARD_RULES: Readonly<Record<string, ClassifyRule>> = {
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
};

export const STANDARD_RULE_NAMES: readonly string[] = Object.keys(STANDARD_RULES);

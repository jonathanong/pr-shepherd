import type { ClassifyRule } from "../types.mts";
import autoHarnessSession from "./auto-harness-session.mts";
import coderabbitNotices from "./coderabbit-notices.mts";
import codecovReport from "./codecov-report.mts";
import codexNotices from "./codex-notices.mts";
import dependabotNotices from "./dependabot-notices.mts";
import geminiNotices from "./gemini-notices.mts";
import kiloNoIssues from "./kilo-no-issues.mts";
import sourceryNotices from "./sourcery-notices.mts";

/**
 * Bundled classification rules that `classify.standard` can enable by name.
 * Each rule matches conversation comments (`pr-comment`) only.
 */
export const STANDARD_RULES: Readonly<Record<string, ClassifyRule>> = {
  "auto-harness-session": autoHarnessSession,
  "coderabbit-notices": coderabbitNotices,
  "codecov-report": codecovReport,
  "codex-notices": codexNotices,
  "dependabot-notices": dependabotNotices,
  "gemini-notices": geminiNotices,
  "kilo-no-issues": kiloNoIssues,
  "sourcery-notices": sourceryNotices,
};

export const STANDARD_RULE_NAMES: readonly string[] = Object.keys(STANDARD_RULES);

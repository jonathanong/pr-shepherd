import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const QUOTA_NOTICES = [
  /^You have reached your Codex usage limits for security reviews\. Please try again later\.$/,
  /^You have reached your Codex usage limits for code reviews\. You can see your limits in the \[Codex usage dashboard\]\(https:\/\/chatgpt\.com\/[^\s)]*\)\.(?:\nTo continue using code reviews, add credits to your account and enable them for code reviews in your \[settings\]\(https:\/\/chatgpt\.com\/[^\s)]*\)\.)?$/,
  /^Codex usage limits have been reached for code reviews\. Please check with the admins of this repo to increase the limits by adding credits\.\nRepo admins can enable using credits for code reviews in their \[settings\]\(https:\/\/chatgpt\.com\/[^\s)]*\)\.$/,
  /^Codex usage limits have been reached\. Please try again later\.$/,
];

const ABOUT_BLOCK =
  /\n\n<details> <summary>ℹ️ About Codex (?:in GitHub|security reviews in GitHub)<\/summary>[\s\S]*?<\/details>$/;

const ACTIVITY_SUMMARY =
  /^<!-- codex-pull-request-review-summary -->\n(?:<!-- codex-[a-z0-9-]+:[^\n]* -->\n)*\n?## Codex Review Summary\n\nThis comment shows the latest Codex review activity on this pull request\.\n\n\| Review \| Status \| Commit \| Review trigger \|\n\| --- \| --- \| --- \| --- \|\n(?:\|[^\n]+\|\n?)+$/;

/** Codex closes with a rotating sign-off: a few plain words, a :shortcode:, or one emoji. */
const CLEAN_REVIEW =
  /^Codex Review: Didn't find any major issues\. (?:(?:[\p{L}'’]+,? ){0,7}[\p{L}'’]+[.!?]|:[a-z0-9_+-]+:|\p{Extended_Pictographic}\uFE0F?)\n\n\*\*Reviewed commit:\*\* `[a-f0-9]+`$/u;

const CLEAN_SECURITY =
  /^### 🛡️ Codex Security Review(?: · _Automatically triggered_)?\n\nSecurity review completed\. No security issues were found in this pull request\.\n\n\*\*Reviewed commit:\*\* `[a-f0-9]+`\n\n\[View security finding report\]\(https:\/\/chatgpt\.com\/[^\s)]*\)\n\n_Only the user who started this review can view the report in Codex\._$/;

/**
 * Codex quota notices, the review-activity status table, and no-findings notices on conversation
 * comments. Each pattern matches the whole comment, so a notice with any appended finding stays
 * visible. Review summaries and inline comments are left for the normal review path.
 */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["chatgpt-codex-connector"], ["pr-comment"])) return null;
  const body = item.body.trim();
  if (QUOTA_NOTICES.some((notice) => notice.test(body))) {
    return { autoResolve: true, suppress: true, reason: "Codex usage-limit notice" };
  }
  // Strip only leading codex-* metadata markers and the trailing About block; extra findings stay
  // visible. The activity table's own marker has no colon, so it is kept for ACTIVITY_SUMMARY.
  const content = body
    .replace(ABOUT_BLOCK, "")
    .trim()
    .replace(/^(?:<!-- codex-[a-z0-9-]+:[^\n]* -->\s*)+/, "");
  if (ACTIVITY_SUMMARY.test(content)) {
    return { autoResolve: true, suppress: true, reason: "Codex review-activity table" };
  }
  if (CLEAN_REVIEW.test(content) || CLEAN_SECURITY.test(content)) {
    return { autoResolve: true, suppress: true, reason: "Codex no-findings notice" };
  }
  return null;
};

export default rule;

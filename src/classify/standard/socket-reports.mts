import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

/**
 * Socket's dependency-change overview: the whole comment is a score table and a report link.
 * Socket posts findings in a separate alerts comment, so any alert wording in the table keeps it
 * visible. Appended prose also keeps it visible, because the pattern spans the entire body.
 */
const OVERVIEW =
  /^\*\*Review the following changes in direct dependencies\.\*\* Learn more about \[Socket for GitHub\]\(https:\/\/socket\.dev[^\s)]*\)\.\n\n<table>[\s\S]*?<\/table>\n\n\[View full report\]\(https:\/\/socket\.dev\/[^\s)]*\)\n\n<!-- overview-comment -->$/;

const ALERT_WORDING = /alerts?\b|warnings?\b|🚨|⚠|\bblock(?:ed|ing)?\b|malware/i;

/** Socket's informational dependency overview. Its security checks still report through checks. */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["socket-security"], ["pr-comment"])) return null;
  const body = item.body.trim();
  if (!OVERVIEW.test(body) || ALERT_WORDING.test(body)) return null;
  return { autoResolve: true, suppress: true, reason: "Socket dependency overview" };
};

export default rule;

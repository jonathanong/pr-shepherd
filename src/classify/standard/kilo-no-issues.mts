import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const STATUS_LINE =
  /^[^\S\n]*(?:\*\*)?Status:?(?:\*\*)?:?[^\S\n]*(?:\p{Extended_Pictographic}️?[^\S\n]*)?No Issues Found\b/imu;
/** Headings a no-issues report carries; any other heading means real feedback. */
const REPORT_HEADING = /^(?:Code Review Summary|Files Reviewed\b.*)$/i;

/** Kilo Code's report whose status line reads "No Issues Found" and that carries no findings. */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["kilo-code-bot"], ["pr-comment", "review-summary"])) return null;
  if (!STATUS_LINE.test(item.body)) return null;
  for (const [, heading] of item.body.matchAll(/^#{1,6}\s+(.*)$/gm)) {
    if (!REPORT_HEADING.test(heading!.trim())) return null;
  }
  return { autoResolve: true, suppress: true, reason: "Kilo Code no-issues report" };
};

export default rule;

import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

/** Gemini Code Assist daily-quota and review-limit notices. A heading means a real review. */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["gemini-code-assist"], ["pr-comment", "review-summary"])) return null;
  if (/^#{1,6}\s/m.test(item.body)) return null;
  if (!/You have reached your daily quota limit|Review limit reached/i.test(item.body)) {
    return null;
  }
  return { autoResolve: true, suppress: true, reason: "Gemini quota or review-limit notice" };
};

export default rule;

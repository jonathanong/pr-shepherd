import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

/**
 * Sourcery's private-repo upsell and weekly rate-limit notices. A real Sourcery review opens
 * with a Markdown heading ("Reviewer's Guide", "Summary by Sourcery"); the notices carry none,
 * so a heading means genuine feedback that merely quotes the phrase.
 */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["sourcery-ai"], ["pr-comment", "review-summary"])) return null;
  if (/^#{1,6}\s/m.test(item.body)) return null;
  if (/does not have access to Sourcery/i.test(item.body)) {
    return { autoResolve: true, suppress: true, reason: "Sourcery no-access upsell" };
  }
  if (/reached your weekly rate limit/i.test(item.body)) {
    return { autoResolve: true, suppress: true, reason: "Sourcery rate-limit notice" };
  }
  return null;
};

export default rule;

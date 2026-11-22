import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const NO_ACCESS =
  /^Hi @[A-Za-z0-9-]+! 👋\n\nYour private repo does not have access to Sourcery\.\n\nPlease \[upgrade\]\(https:\/\/app\.sourcery\.ai\/[^\s)]*\) to continue using Sourcery ✨$/;
const RATE_LIMIT =
  /^Sorry @[A-Za-z0-9-]+, you have reached your weekly rate limit for Sourcery\. Please try again later\.$/;
const WAIT = String.raw`\d+ (?:days? and \d+ hours?|days?|hours? and \d+ minutes?|hours?|minutes?)`;
const REVIEW_BUDGET = new RegExp(
  String.raw`^Sorry @[A-Za-z0-9-]+, you've used your own review budget of \d{1,3}(?:,\d{3})* diff characters for the last \d+ days?\.` +
    String.raw`\n\nYou can request another review in ${WAIT} by commenting \`@sourcery-ai review\`\. ` +
    String.raw`\[Upgrade\]\(https:\/\/app\.sourcery\.ai\/[^\s)]*\) to get a review now\.$`,
);

/** Complete Sourcery private-repo upsell, weekly rate-limit, and review-budget notices. */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["sourcery-ai"], ["pr-comment"])) return null;
  const body = item.body.trim();
  if (NO_ACCESS.test(body)) {
    return { autoResolve: true, suppress: true, reason: "Sourcery no-access upsell" };
  }
  if (RATE_LIMIT.test(body) || REVIEW_BUDGET.test(body)) {
    return { autoResolve: true, suppress: true, reason: "Sourcery rate-limit notice" };
  }
  return null;
};

export default rule;

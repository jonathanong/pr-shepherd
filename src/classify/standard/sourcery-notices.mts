import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const NO_ACCESS =
  /^Hi @[A-Za-z0-9-]+! 👋\n\nYour private repo does not have access to Sourcery\.\n\nPlease \[upgrade\]\(https:\/\/app\.sourcery\.ai\/login\?connection=github(?:&git_namespace_id=\d+)?&from_surface=github_bot&intent=private_repo_upsell\) to continue using Sourcery ✨$/;
const RATE_LIMIT =
  /^Sorry @[A-Za-z0-9-]+, you have reached your weekly rate limit for Sourcery\. Please try again later\.$/;

/** Complete Sourcery private-repo upsell and weekly rate-limit notices. */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["sourcery-ai"], ["pr-comment"])) return null;
  const body = item.body.trim();
  if (NO_ACCESS.test(body)) {
    return { autoResolve: true, suppress: true, reason: "Sourcery no-access upsell" };
  }
  if (RATE_LIMIT.test(body)) {
    return { autoResolve: true, suppress: true, reason: "Sourcery rate-limit notice" };
  }
  return null;
};

export default rule;

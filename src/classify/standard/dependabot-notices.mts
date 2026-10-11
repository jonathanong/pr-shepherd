import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const NOTICES = [
  /^Looks like this PR is already up-to-date with [^\s!]+! If you'd still like to recreate it from scratch, overwriting any edits, you can request `@dependabot recreate`\.$/,
  /^Looks like these dependencies are updatable in another way, so this is no longer needed\.$/,
];

/** Dependabot's replies that report no change to make. */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["dependabot"], ["pr-comment"])) return null;
  const body = item.body.trim();
  if (!NOTICES.some((notice) => notice.test(body))) return null;
  return { autoResolve: true, suppress: true, reason: "Dependabot no-op reply" };
};

export default rule;

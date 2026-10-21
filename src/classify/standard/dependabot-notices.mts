import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const NOTICES = [
  /^Looks like this PR is already up-to-date with [^\s!]+! If you'd still like to recreate it from scratch, overwriting any edits, you can request `@dependabot recreate`\.$/,
  /^Looks like (?:these dependencies are|\S+ is) updatable in another way, so this is no longer needed\.$/,
  /^Superseded by #\d+\.$/,
  /^OK, I won't notify you again about this release, but will get in touch when a new version is available\. If you'd rather skip all updates until the next major or minor version, let me know by commenting `@dependabot ignore this major version` or `@dependabot ignore this minor version`\. You can also ignore all major, minor, or patch releases for a dependency by adding an \[`ignore` condition\]\(https:\/\/docs\.github\.com\/[^\s)]*\) with the desired `update_types` to your config file\.\n\nIf you change your mind, just re-open this PR and I'll resolve any conflicts on it\.$/,
  /^This pull request was built based on a group rule\. Closing it will not ignore any of these versions in future pull requests\.\n\nTo ignore these dependencies, configure \[ignore rules\]\(https:\/\/docs\.github\.com\/[^\s)]*\) in dependabot\.yml$/,
  /^Looks like this PR has been edited by someone other than Dependabot\. That means Dependabot can't rebase it - sorry!\n\nIf you're happy for Dependabot to recreate it from scratch, overwriting any edits, you can request `@dependabot recreate`\.$/,
];

/** Dependabot's replies that report no change to make. */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["dependabot"], ["pr-comment"])) return null;
  const body = item.body.trim();
  if (!NOTICES.some((notice) => notice.test(body))) return null;
  return { autoResolve: true, suppress: true, reason: "Dependabot no-op reply" };
};

export default rule;

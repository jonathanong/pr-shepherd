import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

/** A session pointer with no review feedback; the link and marker must name the same session. */
const SESSION_POINTER =
  /^👀 \[View the Auto Harness session\]\(https:\/\/d2itfsupognuru\.cloudfront\.net\/sessions\/(sess-[a-f0-9]{8})\)\.\n\n<!-- auto-harness-session:\1 -->$/;

const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["github-actions"], ["pr-comment"])) return null;
  if (!SESSION_POINTER.test(item.body.trim())) return null;
  return { autoResolve: true, suppress: true, reason: "Auto Harness session pointer" };
};

export default rule;

import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const NOTICES = [
  "You have reached your daily quota limit. Please wait up to 24 hours and I will start processing your requests again!",
  "Review limit reached. I'll be able to review this pull request again tomorrow.",
];

/** Complete Gemini Code Assist quota and review-limit notices. */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["gemini-code-assist"], ["pr-comment"])) return null;
  if (!NOTICES.includes(item.body.trim())) return null;
  return { autoResolve: true, suppress: true, reason: "Gemini quota or review-limit notice" };
};

export default rule;

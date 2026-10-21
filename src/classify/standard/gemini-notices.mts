import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const NOTICES = [
  "You have reached your daily quota limit. Please wait up to 24 hours and I will start processing your requests again!",
  "Review limit reached. I'll be able to review this pull request again tomorrow.",
  "Gemini is unable to generate a review for this pull request due to the file types involved not being currently supported.",
  "Gemini is unable to generate a summary for this pull request due to the file types involved not being currently supported.",
];

/** A GitHub alert prefix such as `> [!WARNING]`, with the notice on the following quoted line. */
const ALERT_PREFIX = /^> \[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n> /;

/** Complete Gemini Code Assist quota, review-limit, and unsupported-file notices. */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["gemini-code-assist"], ["pr-comment"])) return null;
  if (!NOTICES.includes(item.body.trim().replace(ALERT_PREFIX, ""))) return null;
  return { autoResolve: true, suppress: true, reason: "Gemini quota or review-limit notice" };
};

export default rule;

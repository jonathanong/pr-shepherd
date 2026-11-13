import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

/**
 * actions/dependency-review-action's comment when it found nothing: the pass line, an optional
 * OpenSSF Scorecard table, and the scanned-file list. Any other section (snapshot warnings, denied
 * or deprecated packages) or a failure summary keeps it visible.
 */
const PASSED =
  /^<h1>Dependency Review<\/h1>\n✅ No vulnerabilities or license issues(?: or OpenSSF Scorecard issues)? found\.(?:<h2>OpenSSF Scorecard<\/h2>\n<table>(?:(?!<h[12]>)[\s\S])*?<\/table>)?<h2>Scanned Files<\/h2>\n(?:None|<ul>(?:<li>[^<\n]*<\/li>)*<\/ul>)\n*<!-- dependency-review-pr-comment-marker -->$/;

/** The dependency-review action's no-issues comment, posted as the Actions bot. */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["github-actions"], ["pr-comment"])) return null;
  if (!PASSED.test(item.body.trim())) return null;
  return { autoResolve: true, suppress: true, reason: "Dependency Review no-issues comment" };
};

export default rule;

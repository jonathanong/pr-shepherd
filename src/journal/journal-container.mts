import { detailsTags, rawDetailsTags, rawHtmlState } from "./markdown-details.mts";
import type { scanMarkdownLines } from "./markdown-line.mts";

export const LEGACY = /^ {0,3}##[ \t]+Shepherd[ \t]+Journal(?:[ \t]+#+)?[ \t]*$/;
export const JOURNAL_SUMMARY = /^<summary>\s*Shepherd\s+Journal\b/i;
export const CLOSE = "</details>";

/** Return the line of the canonical `</details>` closing a journal container, or null. */
export function closeJournalContainer(
  lines: string[],
  syntax: ReturnType<typeof scanMarkdownLines>,
  start: number,
): number | null {
  let depth = 1;
  let html = rawHtmlState();
  for (let i = start; i < lines.length; i++) {
    if (syntax[i]!.nested) continue;
    if (syntax[i]!.rawHtml) {
      for (const tag of rawDetailsTags(lines[i]!, html)) if ((depth += tag) === 0) return null;
      continue;
    }
    html = rawHtmlState();
    if (syntax[i]!.ignored) continue;
    const visible = syntax[i]!.visiblePrefix;
    if (JOURNAL_SUMMARY.test(visible.trimStart()) || LEGACY.test(visible)) return null;
    depth += detailsTags(visible, false);
    const closes = detailsTags(visible, true);
    if (closes) {
      depth -= closes;
      if (depth <= 0) return depth === 0 && lines[i] === CLOSE ? i : null;
    }
  }
  return null;
}

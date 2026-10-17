import { inQuotedHtmlAttribute } from "./markdown-html.mts";
import { structuralDetailsStart } from "./markdown-structure.mts";

export function detailsTags(line: string, closing: boolean): number {
  if (structuralDetailsStart(line) === null) return 0;
  const expression = closing ? /<\/details>/gi : /<details(?:\s+[^>]*)?\/?>/gi;
  return [...line.matchAll(expression)].filter(
    (match) => !inQuotedHtmlAttribute(line, match.index!),
  ).length;
}

export type DetailsDepth = { outer: number; raw: number };

/**
 * Apply `<details>` tags from a raw HTML block line. The browser still parses
 * them, so a closer there can end a block opened as Markdown structure.
 * Openers nest within the raw block; returns whether a closer ended an outer block.
 */
export function rawDetailsTags(line: string, depth: DetailsDepth): boolean {
  let closedOuter = false;
  for (const match of line.matchAll(/<(\/?)details(?:\s+[^>]*)?\/?>/gi)) {
    if (inQuotedHtmlAttribute(line, match.index!)) continue;
    if (!match[1]) depth.raw++;
    else if (depth.raw > 0) depth.raw--;
    else if (depth.outer > 0) {
      depth.outer--;
      closedOuter = true;
    }
  }
  return closedOuter;
}

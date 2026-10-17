import { inQuotedHtmlAttribute } from "./markdown-html.mts";
import { structuralDetailsStart } from "./markdown-structure.mts";

export function detailsTags(line: string, closing: boolean): number {
  if (structuralDetailsStart(line) === null) return 0;
  const expression = closing ? /<\/details>/gi : /<details(?:\s+[^>]*)?\/?>/gi;
  return [...line.matchAll(expression)].filter(
    (match) => !inQuotedHtmlAttribute(line, match.index!),
  ).length;
}

const RAW_TEXT = new Set([
  "iframe",
  "noembed",
  "noframes",
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
]);

/** Tokenizer state carried across the lines of one raw HTML block. */
export type RawHtmlState = {
  mode: "comment" | "data" | "raw-text" | "tag";
  quote: '"' | "'" | null;
  rawTag: string | null;
};

export const rawHtmlState = (): RawHtmlState => ({ mode: "data", quote: null, rawTag: null });

/**
 * Return `1` per `<details>` opener and `-1` per closer that the browser
 * creates from a raw HTML block line. Tags inside comments, raw-text elements,
 * and (possibly multiline) attribute values do not count.
 */
export function rawDetailsTags(line: string, state: RawHtmlState): Array<1 | -1> {
  const tags: Array<1 | -1> = [];
  let i = 0;
  while (i < line.length) {
    if (state.mode === "comment") {
      const end = /--!?>/.exec(line.slice(i));
      if (!end) break;
      state.mode = "data";
      i += end.index + end[0].length;
    } else if (state.mode === "raw-text") {
      const end = new RegExp(`</${state.rawTag}(?=[\\s/>]|$)`, "i").exec(line.slice(i));
      if (!end) break;
      state.mode = "tag";
      state.rawTag = null;
      i += end.index + end[0].length;
    } else if (state.mode === "tag") {
      const char = line[i++];
      if (state.quote) {
        if (char === state.quote) state.quote = null;
      } else if (char === '"' || char === "'") state.quote = char;
      else if (char === ">") state.mode = state.rawTag ? "raw-text" : "data";
    } else {
      const open = line.indexOf("<", i);
      if (open === -1) break;
      if (line.startsWith("<!--", open)) {
        state.mode = "comment";
        i = open + 4;
        continue;
      }
      const tag = /^<(\/?)([A-Za-z][A-Za-z0-9-]*)/.exec(line.slice(open));
      if (!tag) {
        i = open + 1;
        continue;
      }
      const name = tag[2]!.toLowerCase();
      if (name === "details") tags.push(tag[1] ? -1 : 1);
      state.mode = "tag";
      state.rawTag = !tag[1] && RAW_TEXT.has(name) ? name : null;
      i = open + tag[0].length;
    }
  }
  return tags;
}

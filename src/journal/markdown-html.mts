import { markdownContainer, type MarkdownContainer } from "./markdown-container.mts";

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "base",
  "basefont",
  "blockquote",
  "body",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "iframe",
  "legend",
  "li",
  "link",
  "main",
  "menu",
  "menuitem",
  "nav",
  "noframes",
  "ol",
  "optgroup",
  "option",
  "p",
  "param",
  "plaintext",
  "search",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "title",
  "tr",
  "track",
  "ul",
  "wbr",
]);
export type RawHtmlBlock =
  | { container: MarkdownContainer; kind: "closing-tag"; tag: string }
  | { container: MarkdownContainer; kind: "blank-line" }
  | { container: MarkdownContainer; kind: "terminator"; terminator: string };

export function rawHtmlStart(line: string, parsed = markdownContainer(line)): RawHtmlBlock | null {
  const { content, indent, tokens } = parsed;
  const visible = `${" ".repeat(indent)}${content}`;
  const tag = visible.match(/^ {0,3}<(pre|script|style|textarea)(?:\s|>|$)/i)?.[1];
  if (tag) return { container: tokens, kind: "closing-tag", tag };
  if (/^ {0,3}<\?(?:.|\n)*/.test(visible))
    return { container: tokens, kind: "terminator", terminator: "?>" };
  if (/^ {0,3}<!\[CDATA\[/.test(visible))
    return { container: tokens, kind: "terminator", terminator: "]]>" };
  if (/^ {0,3}<![A-Z]/.test(visible))
    return { container: tokens, kind: "terminator", terminator: ">" };
  const block = visible
    .match(/^ {0,3}<\/?([A-Za-z][A-Za-z0-9-]*)(?:\s|\/?>|$)/)?.[1]
    ?.toLowerCase();
  if (!block || block === "details" || block === "summary") return null;
  if (
    !BLOCK_TAGS.has(block) &&
    !/^ {0,3}<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*?|\/?)>$/.test(visible)
  )
    return null;
  return { container: tokens, kind: "blank-line" };
}

export function rawHtmlEnd(block: RawHtmlBlock, content: string): number | null {
  if (block.kind === "blank-line") return content.trim() === "" ? 0 : null;
  if (block.kind === "terminator") {
    const index = content.indexOf(block.terminator);
    return index === -1 ? null : index + block.terminator.length;
  }
  const close = new RegExp(`</${block.tag}>`, "i").exec(content);
  return close ? close.index + close[0].length : null;
}

export function inQuotedHtmlAttribute(line: string, offset: number): boolean {
  let inTag = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < offset; i++) {
    const char = line[i];
    if (!inTag) {
      if (char === "<" && /^\/?[A-Za-z]/.test(line.slice(i + 1))) inTag = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === ">") inTag = false;
  }
  return inTag && quote !== null;
}

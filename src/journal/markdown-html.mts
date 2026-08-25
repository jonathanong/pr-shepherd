import { markdownContainer, type MarkdownContainer } from "./markdown-container.mts";

export type RawHtmlBlock = { container: MarkdownContainer; tag: string };

export function rawHtmlStart(line: string): RawHtmlBlock | null {
  const { content, indent, tokens } = markdownContainer(line);
  const tag = `${" ".repeat(indent)}${content}`.match(
    /^ {0,3}<(pre|script|style|textarea)(?:\s|>|$)/i,
  )?.[1];
  return tag ? { container: tokens, tag } : null;
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

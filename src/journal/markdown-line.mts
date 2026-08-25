import {
  fenceStart,
  type MarkdownContainer,
  resolveMarkdownContainer,
  stripMarkdownContainer,
} from "./markdown-container.mts";
import {
  inQuotedHtmlAttribute,
  rawHtmlEnd,
  rawHtmlStart,
  type RawHtmlBlock,
} from "./markdown-html.mts";
import { backtickRuns, nextBacktickRun, nextCodeOpener } from "./markdown-backticks.mts";
import { isIndentedCode, structuralDetailsStart } from "./markdown-structure.mts";
type MarkdownLine = { ignored: boolean; nested: boolean; visiblePrefix: string };
type MarkdownScan = { lines: MarkdownLine[]; safeAtEof: boolean };
function interruptsInlineContent(line: string): boolean {
  return (
    line.trim() === "" ||
    /^ {0,3}(?:#{1,6}(?:[ \t]+|$)|>)/.test(line) ||
    /^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+/.test(line) ||
    /^ {0,3}(?:(?:\*[ \t]*){3,}|-+[ \t]*|(?:_[ \t]*){3,}|=+[ \t]*)$/.test(line) ||
    fenceStart(line) !== null ||
    rawHtmlStart(line) !== null ||
    structuralDetailsStart(line) !== null
  );
}
function hasCloser(lines: string[], lineIndex: number, offset: number, length: number): boolean {
  for (let i = lineIndex; i < lines.length; i++) {
    if (i > lineIndex && interruptsInlineContent(lines[i]!)) return false;
    if (
      backtickRuns(lines[i]!).some(
        (run) => run.length === length && (i > lineIndex || run.index > offset),
      )
    )
      return true;
  }
  return false;
}
function scanMarkdown(lines: string[]): MarkdownScan {
  const result: MarkdownLine[] = [];
  let codeSpan: number | null = null;
  let comment: { container: MarkdownContainer } | null = null;
  let fence: { container: MarkdownContainer; length: number; marker: string } | null = null;
  let html: RawHtmlBlock | null = null;
  let activeContainer: MarkdownContainer = [];
  let indentedCodeContainer: MarkdownContainer | null = null;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    const container = resolveMarkdownContainer(line, activeContainer);
    activeContainer = container.tokens;
    const nested = container.tokens.length > 0;
    const push = (ignored: boolean, visiblePrefix: string) =>
      result.push({ ignored, nested, visiblePrefix });
    if (indentedCodeContainer) {
      if (stripMarkdownContainer(line, indentedCodeContainer) !== null) {
        push(true, "");
        continue;
      }
      indentedCodeContainer = null;
    }
    let allowCodeOpeners = true;
    let forceIgnored = false;
    let scanOffset = 0;
    if (html) {
      const content = stripMarkdownContainer(line, html.container);
      if (content === null) html = null;
      else {
        const end = rawHtmlEnd(html, content);
        if (end === null) {
          push(true, "");
          continue;
        }
        html = null;
        allowCodeOpeners = false;
        forceIgnored = true;
        scanOffset = line.length - content.length + end;
      }
    }
    if (!forceIgnored && fence) {
      const content = stripMarkdownContainer(line, fence.container);
      if (content === null) fence = null;
      else {
        const match = content.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (
          match &&
          match[1]![0] === fence.marker &&
          match[1]!.length >= fence.length &&
          /^[ \t]*$/.test(match[2]!)
        )
          fence = null;
        push(true, "");
        continue;
      }
    }
    if (comment && stripMarkdownContainer(line, comment.container) === null) comment = null;
    if (!forceIgnored && codeSpan === null && !comment) {
      if (isIndentedCode(`${" ".repeat(container.indent)}${container.content}`)) {
        if (container.tokens.length) indentedCodeContainer = container.tokens;
        push(true, "");
        continue;
      }
      const openingFence = fenceStart(line, container);
      if (openingFence) {
        fence = openingFence;
        push(true, "");
        continue;
      }
      const openingHtml = rawHtmlStart(line);
      if (openingHtml) {
        const content = stripMarkdownContainer(line, openingHtml.container) ?? "";
        const end = rawHtmlEnd(openingHtml, content);
        if (end === null) {
          html = openingHtml;
          push(true, "");
          continue;
        }
        allowCodeOpeners = false;
        forceIgnored = true;
        scanOffset = line.length - content.length + end;
      }
    }
    const startsMasked = forceIgnored || codeSpan !== null || comment !== null;
    const visible = line.split("");
    const runs = backtickRuns(line);
    const mask = (start: number, end: number) => visible.fill(" ", start, end);
    let offset = scanOffset;
    while (offset < line.length) {
      if (comment) {
        const close = /--!?>/.exec(line.slice(offset));
        const end = close === null ? line.length : offset + close.index + close[0].length;
        mask(offset, end);
        if (close === null) break;
        comment = null;
        offset = end;
        continue;
      }
      if (codeSpan !== null) {
        const close = nextBacktickRun(runs, offset, codeSpan);
        mask(offset, close ? close.index + close.length : line.length);
        if (!close) break;
        codeSpan = null;
        offset = close.index + close.length;
        continue;
      }
      const commentAt = line.indexOf("<!--", offset);
      const nextRun = allowCodeOpeners ? nextCodeOpener(runs, offset) : undefined;
      if (commentAt !== -1 && (!nextRun || commentAt < nextRun.index)) {
        let slashes = 0;
        while (line[commentAt - slashes - 1] === "\\") slashes++;
        if (slashes % 2 === 1 || inQuotedHtmlAttribute(line, commentAt)) {
          offset = commentAt + 4;
          continue;
        }
        mask(commentAt, commentAt + 4);
        comment = { container: activeContainer };
        offset = commentAt + 4;
        continue;
      }
      if (!nextRun) break;
      if (!nextRun.escaped && hasCloser(lines, lineIndex, nextRun.index, nextRun.length)) {
        codeSpan = nextRun.length;
        mask(nextRun.index, nextRun.index + nextRun.length);
      }
      offset = nextRun.index + nextRun.length;
    }
    const visiblePrefix = visible.join("");
    push(startsMasked || visiblePrefix === "", visiblePrefix);
  }
  return {
    lines: result,
    safeAtEof: comment === null && fence === null && (html === null || html.kind === "blank-line"),
  };
}
export const scanMarkdownLines = (lines: string[]): MarkdownLine[] => scanMarkdown(lines).lines;
export const isSafeMarkdownInsertionPoint = (lines: string[]): boolean =>
  scanMarkdown(lines).safeAtEof;

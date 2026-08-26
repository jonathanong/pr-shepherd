export type MarkdownContainer = Array<{ kind: "list"; width: number } | { kind: "quote" }>;

function visualColumn(line: string, end: number): number {
  let column = 0;
  for (let i = 0; i < end; i++)
    column = line[i] === "\t" ? column + (4 - (column % 4)) : column + 1;
  return column;
}

function quoteEnd(line: string, offset: number): number | null {
  let marker = offset;
  while (marker < offset + 3 && line[marker] === " ") marker++;
  if (line[marker] !== ">") return null;
  marker++;
  return line[marker] === " " || line[marker] === "\t" ? marker + 1 : marker;
}

function listEnd(
  line: string,
  offset: number,
): { end: number; indent: number; width: number } | null {
  let marker = offset;
  while (marker < offset + 3 && line[marker] === " ") marker++;
  const match = line.slice(marker).match(/^(?:[-+*]|\d{1,9}[.)])/)?.[0];
  if (!match) return null;
  let end = marker + match.length;
  const paddingStart = end;
  const startColumn = visualColumn(line, offset);
  let column = visualColumn(line, end);
  let padding = 0;
  while (line[end] === " " || line[end] === "\t") {
    const nextColumn = line[end] === "\t" ? column + (4 - (column % 4)) : column + 1;
    padding += nextColumn - column;
    column = nextColumn;
    end++;
  }
  if (padding === 0) return null;
  if (padding > 4) {
    end = paddingStart + 1;
    const actualWidth = visualColumn(line, end) - visualColumn(line, paddingStart);
    column = visualColumn(line, paddingStart) + 1;
    return { end, indent: actualWidth - 1, width: column - startColumn };
  }
  return { end, indent: 0, width: column - startColumn };
}

export function markdownContainer(line: string): {
  content: string;
  indent: number;
  tokens: MarkdownContainer;
} {
  const tokens: MarkdownContainer = [];
  let indent = 0;
  let offset = 0;
  while (true) {
    const quote = quoteEnd(line, offset);
    if (quote !== null) {
      tokens.push({ kind: "quote" });
      offset = quote;
      continue;
    }
    const list = listEnd(line, offset);
    if (!list) break;
    tokens.push({ kind: "list", width: list.width });
    offset = list.end;
    indent = list.indent;
    if (indent) break;
  }
  return { content: line.slice(offset), indent, tokens };
}

export function resolveMarkdownContainer(
  line: string,
  active: MarkdownContainer,
): ReturnType<typeof markdownContainer> {
  for (let depth = active.length; depth > 0; depth--) {
    const retained = active.slice(0, depth);
    const continuation = stripMarkdownContainer(line, retained);
    if (continuation === null) continue;
    const nested = markdownContainer(continuation);
    return {
      content: nested.content,
      indent: nested.indent,
      tokens: [...retained, ...nested.tokens],
    };
  }
  return markdownContainer(line);
}

export function fenceStart(
  line: string,
  parsed = markdownContainer(line),
): { container: MarkdownContainer; length: number; marker: string } | null {
  const match = `${" ".repeat(parsed.indent)}${parsed.content}`.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  return match && !(match[1][0] === "`" && match[2].includes("`"))
    ? { container: parsed.tokens, length: match[1].length, marker: match[1][0] }
    : null;
}

export function stripMarkdownContainer(line: string, tokens: MarkdownContainer): string | null {
  let offset = 0;
  for (const [index, token] of tokens.entries()) {
    if (token.kind === "quote") {
      const end = quoteEnd(line, offset);
      if (end === null) return null;
      offset = end;
      continue;
    }
    if (
      line.slice(offset).trim() === "" &&
      tokens.slice(index).every((item) => item.kind === "list")
    )
      return "";
    const startColumn = visualColumn(line, offset);
    let column = startColumn;
    while (column - startColumn < token.width && (line[offset] === " " || line[offset] === "\t")) {
      column = line[offset] === "\t" ? column + (4 - (column % 4)) : column + 1;
      offset++;
    }
    if (column - startColumn < token.width) return null;
  }
  return line.slice(offset);
}

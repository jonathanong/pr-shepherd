type MarkdownLine = { ignored: boolean; nested: boolean; visiblePrefix: string };

const NON_PARAGRAPH = /^ {0,3}(?:#{1,6}(?:[ \t]+|$)|>|(?:[-+*]|\d{1,9}[.)])[ \t]+)/;

function isParagraphText(line: string, syntax: MarkdownLine): boolean {
  return (
    !syntax.ignored &&
    !syntax.nested &&
    line.trim() !== "" &&
    !NON_PARAGRAPH.test(syntax.visiblePrefix)
  );
}

export function setextParagraphStart(
  lines: string[],
  syntax: MarkdownLine[],
  underline: number,
): number | null {
  let start = underline - 1;
  if (start < 0 || !isParagraphText(lines[start]!, syntax[start]!)) return null;
  while (start > 0 && isParagraphText(lines[start - 1]!, syntax[start - 1]!)) start--;
  return start;
}

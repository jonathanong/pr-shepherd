export function isIndentedCode(line: string): boolean {
  let columns = 0;
  for (const char of line) {
    if (char !== " " && char !== "\t") break;
    columns += char === "\t" ? 4 - (columns % 4) : 1;
  }
  return columns >= 4;
}

export function structuralDetailsStart(line: string): number | null {
  let index = 0;
  while (line[index] === " " && index < 4) index++;
  if (index > 3 || line[index] === "\t") return null;
  if (/^<(?:details(?:\s+[^>]*)?\/?|\/details)>/i.test(line.slice(index))) return index;
  const marker = line.slice(index).match(/^(?:[-+*]|\d{1,9}[.)])/);
  if (!marker) return null;
  index += marker[0].length;
  let column = index;
  let padding = 0;
  while (line[index] === " " || line[index] === "\t") {
    const nextColumn = line[index] === "\t" ? column + (4 - (column % 4)) : column + 1;
    padding += nextColumn - column;
    column = nextColumn;
    index++;
  }
  return padding > 0 &&
    padding <= 4 &&
    /^<(?:details(?:\s+[^>]*)?\/?|\/details)>/i.test(line.slice(index))
    ? index
    : null;
}

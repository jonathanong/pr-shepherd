export const normalizeLine = (line: string): string =>
  line.endsWith("\r") ? line.slice(0, -1) : line;

export function splitFileLines(originalContent: string): string[] {
  const body = originalContent.endsWith("\n") ? originalContent.slice(0, -1) : originalContent;
  return originalContent === "" ? [] : body.split("\n");
}

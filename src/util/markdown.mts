export function joinSections(sections: (string | null | undefined)[]): string {
  return sections
    .filter((s): s is string => s != null)
    .map((s) => s.replace(/^[\r\n]+|[\r\n]+$/g, ""))
    .filter((s) => s !== "")
    .join("\n\n");
}

/** Wrap arbitrary text in a CommonMark code span without colliding with embedded backticks. */
export function inlineCode(value: string): string {
  const longestRun = Math.max(0, ...Array.from(value.matchAll(/`+/g), (match) => match[0].length));
  const delimiter = "`".repeat(longestRun + 1);
  const padding = value.startsWith("`") || value.endsWith("`") ? " " : "";
  return `${delimiter}${padding}${value}${padding}${delimiter}`;
}

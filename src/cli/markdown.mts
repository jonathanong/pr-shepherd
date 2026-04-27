export function joinSections(sections: (string | null | undefined)[]): string {
  return sections
    .filter((s): s is string => s != null && s !== "")
    .map((s) => s.replace(/^\n+|\n+$/g, ""))
    .join("\n\n");
}

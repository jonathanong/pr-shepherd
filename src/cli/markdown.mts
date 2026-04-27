export function joinSections(sections: (string | null | undefined)[]): string {
  return sections
    .filter((s): s is string => s != null && s !== "")
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n");
}

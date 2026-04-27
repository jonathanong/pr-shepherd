export function joinSections(sections: (string | null | undefined)[]): string {
  return sections
    .filter((s): s is string => s != null)
    .map((s) => s.replace(/^[\r\n]+|[\r\n]+$/g, ""))
    .filter((s) => s !== "")
    .join("\n\n");
}

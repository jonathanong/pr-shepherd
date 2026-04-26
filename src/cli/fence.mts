export function safeFence(content: string): string {
  const maxRun = Math.max(0, ...Array.from(content.matchAll(/`+/g), (m) => m[0].length));
  return "`".repeat(Math.max(3, maxRun + 1));
}

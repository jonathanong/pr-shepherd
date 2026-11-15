/** Workflow file path without a REST `@<ref>` suffix, or undefined when blank. */
export function normalizeWorkflowPath(path: string | null | undefined): string | undefined {
  return path?.split("@")[0]?.trim() || undefined;
}

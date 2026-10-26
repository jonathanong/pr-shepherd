import type { PollSummaryRuleAutoResolve } from "../types.mts";

/** Row lines for an aggregate row or stack layer: the one-PR `## Classification auto-resolve` content. */
export function formatRuleAutoResolveLines(
  event: PollSummaryRuleAutoResolve | undefined,
): string[] {
  if (!event) return [];
  const link = (kind: string, id: string, url: string | undefined): string =>
    `    - ${kind} \`${id}\`${url ? ` ${url}` : ""}`;
  return [
    `  - classification auto-resolve: ${event.summary}`,
    ...(event.threads ?? []).map((thread) => link("thread", thread.id, thread.url)),
    ...(event.minimized ?? []).map((item) => link(item.kind, item.id, item.url)),
    ...(event.errors ?? []).map((error) => `    - ${error}`),
  ];
}

import type { CheckRun } from "../types.mts";
import type { RawContextNode } from "./batch-raw-types.mts";
import { mapCheckRunNode, mapStatusContextState, parseCreatedAt } from "./batch-parser-helpers.mts";

export function parseCheckNodes(
  nodes: Array<RawContextNode | null> | undefined,
  mergeCommitOid?: string,
): CheckRun[] {
  return (nodes ?? []).flatMap<CheckRun>((node) => {
    const scope = mergeCommitOid
      ? { scope: "merge_group" as const, commitOid: mergeCommitOid }
      : {};
    if (node?.__typename === "CheckRun") return [{ ...mapCheckRunNode(node), ...scope }];
    if (node?.__typename !== "StatusContext") return [];
    const { status, conclusion } = mapStatusContextState(node.state);
    const summary = node.description?.trim() || undefined;
    const createdAtUnix = node.createdAt ? parseCreatedAt(node.createdAt) : undefined;
    return [
      {
        name: node.context,
        status,
        conclusion,
        source: "status_context",
        detailsUrl: node.targetUrl ?? "",
        event: null,
        runId: null,
        ...scope,
        ...(createdAtUnix !== undefined && { createdAtUnix }),
        ...(summary !== undefined && { summary }),
      },
    ];
  });
}

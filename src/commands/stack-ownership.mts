import type { PollSummaryItem, PollSummaryResult } from "../types.mts";
import { renderShellCommand } from "../cli/runner.mts";
import { formatStackLayers } from "./iterate/stack-boundary.mts";
import { isStackLayerReady, openLayers, stackPosition } from "./stack-merge-scope.mts";

/**
 * Branch updates when the caller owns only some layers. A one-PR session prints a whole-stack
 * `gh stack rebase` / `gh stack push`, which would rewrite the layers the caller does not own.
 * This step bounds the update at the first unowned layer; undefined when it does not apply.
 */
export function ownershipBoundaryStep(result: PollSummaryResult): string | undefined {
  if (result.selection.kind !== "stack" || !result.selection.owned) return undefined;
  const open = openLayers(result);
  const stale = new Set((result.stackAncestry ?? []).map((gap) => gap.childPr));
  const unowned = open.filter((item) => !item.owned);
  const needsWork = open.filter(
    (item) => item.owned && (!isStackLayerReady(item) || stale.has(item.pr)),
  );
  const boundary = unowned[0];
  if (!boundary || needsWork.length === 0) return undefined;
  const names = unowned.map((item) => `#${item.pr}`).join(", ");
  const below = open.filter((item) => item.owned && stackPosition(item) < stackPosition(boundary));
  const top = below.at(-1);
  const head = `Branch updates: unowned ${unowned.length === 1 ? "layer" : "layers"} ${names} ${unowned.length === 1 ? "sits" : "sit"} in this stack and must not be rebased or pushed. A \`gh stack rebase\` or \`gh stack push\` printed by a one-PR session covers the whole stack, so do not run it as printed.`;
  if (!top) {
    return `${head} No owned layer sits below the first unowned layer (#${boundary.pr}), so no owned branch can be restacked without rewriting it. Do not rebase or push; report that the owned layers wait on #${boundary.pr}'s owner.`;
  }
  const branches = below.map((item) => `\`${item.headRefName}\``).join(", ");
  return `${head} Instead, stop at the first unowned layer (#${boundary.pr}): check out \`${top.headRefName}\` (PR #${top.pr}), run \`gh stack rebase --downstack\`, then push only the owned branches (${branches}) with \`git push --force-with-lease <push-remote> <branch>\` (substitute this repository's push remote for \`<push-remote>\`, the remote \`gh stack push\` uses). Owned layers above #${boundary.pr} cannot be restacked this way. After the update, ${names} (and anything above) will be stale: tell the user their owner must restack ${unowned.length === 1 ? "it" : "them"}.`;
}

/** Listed PRs that are no longer layers of the stack (a teammate ran `gh stack unstack` or `modify`). */
export function missingListedLayers(
  prs: PollSummaryItem[],
  listed: number[] | undefined,
): number[] {
  const members = new Set(prs.map((item) => item.pr));
  return (listed ?? []).filter((pr) => !members.has(pr));
}

/**
 * The escalation for a listed PR that left the stack after the command started. The caller named
 * its own layers, so the CLI cannot tell which layers are now the caller's; nothing runs.
 */
export function listedLayerLeftStack(
  result: PollSummaryResult,
  missing: number[],
  rerunTarget: string,
): PollSummaryResult {
  const many = missing.length > 1;
  const names = missing.map((pr) => `PR #${pr}`).join(", ");
  const stackNumber = result.selection.kind === "stack" ? result.selection.stackNumber : 0;
  return {
    ...result,
    reason: "actionable",
    nextAction: "escalate",
    stackMergeable: false,
    instructions: [
      `1. \`listed-pr-left-stack\`: ${names} ${many ? "are" : "is"} no longer in native stack #${stackNumber}, so the layers you listed no longer match the stack. Nothing was merged or changed. Stop and tell the user. If ${many ? "they were" : "it was"} removed on purpose, rerun ${rerunTarget} with only the PRs that remain in the stack listed after \`stack\`.`,
    ],
  };
}

/**
 * Hand a routed one-PR command the stack's layer ownership, so that session never prints a
 * whole-stack rebase or push while an open layer is not the caller's.
 */
function withLayerOwnership(item: PollSummaryItem, prs: PollSummaryItem[]): PollSummaryItem {
  if (!item.pollCommand || !item.owned) return item;
  const layers = prs
    .filter((layer) => layer.state === "OPEN" && layer.stack)
    .map((layer) => ({
      pr: layer.pr,
      position: layer.stack!.position,
      owned: layer.owned === true,
      branch: layer.headRefName,
    }));
  if (layers.every((layer) => layer.owned)) return item;
  const flag = renderShellCommand(["--layers", formatStackLayers(layers)]);
  return { ...item, pollCommand: `${item.pollCommand} ${flag}` };
}

/**
 * Mark the layers the caller declared as its own: every layer when it listed none, otherwise the
 * listed PRs that are still layers. Ownership is declared, never inferred from the author. When
 * the caller owns only some layers, each owned row's `pollCommand` carries the layer ownership.
 */
export function applyStackOwnership(
  selection: Extract<PollSummaryResult["selection"], { kind: "stack" }>,
  prs: PollSummaryItem[],
  listed: number[] | undefined,
): { selection: PollSummaryResult["selection"]; prs: PollSummaryItem[] } {
  const members = new Set(prs.map((item) => item.pr));
  const owned = listed ? new Set(listed) : members;
  const marked = prs.map(({ owned: _author, ...item }) =>
    owned.has(item.pr) ? { ...item, owned: true as const } : item,
  );
  return {
    selection: listed ? { ...selection, owned: listed } : selection,
    prs: listed ? marked.map((item) => withLayerOwnership(item, marked)) : marked,
  };
}

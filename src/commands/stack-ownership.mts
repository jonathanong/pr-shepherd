import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { PollSummaryItem, PollSummaryResult } from "../types.mts";
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
  return `${head} Instead, stop at the first unowned layer (#${boundary.pr}): check out \`${top.headRefName}\` (PR #${top.pr}), run \`gh stack rebase --downstack\`, then push only the owned branches (${branches}) with \`git push --force-with-lease origin <branch>\`. Owned layers above #${boundary.pr} cannot be restacked this way. After the update, ${names} (and anything above) will be stale: tell the user their owner must restack ${unowned.length === 1 ? "it" : "them"}.`;
}

/**
 * Mark the layers the caller declared as its own: every layer when it listed none, otherwise the
 * listed PRs, all of which must be layers. Ownership is declared, never inferred from the author.
 */
export function applyStackOwnership(
  selection: Extract<PollSummaryResult["selection"], { kind: "stack" }>,
  prs: PollSummaryItem[],
  listed: number[] | undefined,
): { selection: PollSummaryResult["selection"]; prs: PollSummaryItem[] } {
  const members = new Set(prs.map((item) => item.pr));
  const missing = (listed ?? []).filter((pr) => !members.has(pr));
  if (missing.length > 0) {
    throw new ShepherdError(
      `${missing.map((pr) => `PR #${pr}`).join(", ")} ${missing.length === 1 ? "is" : "are"} not in native stack #${selection.stackNumber}. One stack per command.`,
      EXIT.USAGE,
    );
  }
  const owned = listed ? new Set(listed) : members;
  return {
    selection: listed ? { ...selection, owned: listed } : selection,
    prs: prs.map(({ owned: _author, ...item }) =>
      owned.has(item.pr) ? { ...item, owned: true } : item,
    ),
  };
}

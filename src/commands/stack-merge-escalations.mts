import type { PollSummaryItem, PollSummaryResult, StackMergeScope } from "../types.mts";
import type { StackPlan } from "./stack-drain.mts";
import { stackPosition } from "./stack-merge-scope.mts";
import { stackRerunTarget } from "./stack-work.mts";

/** Commands that approve unlisted layers: list them as well, or name the stack number. */
export type ApproveCommands = (extra: number[]) => { listed: string; whole: string };

/** `#41 (@alice, "Add parser")` for each layer, so the user can recognize whose work it is. */
function describeLayers(items: PollSummaryItem[]): string {
  return items
    .map((i) => `#${i.pr} (${i.authorLogin ? `@${i.authorLogin}, ` : ""}"${i.title}")`)
    .join(", ");
}

/**
 * The escalation for a merge that would land layers the caller did not list. It names each layer
 * with its author and title, says what merging would do, and prints the commands that approve.
 */
export function unlistedEscalation(
  target: PollSummaryItem,
  unlisted: PollSummaryItem[],
  rerunCommand: string | undefined,
  approve: ApproveCommands | undefined,
): StackPlan {
  const commands = approve?.(unlisted.map((item) => item.pr));
  const owner = unlisted.length === 1 ? "its owner" : "their owners";
  const them = unlisted.length === 1 ? "that layer" : "those layers";
  const listAll = commands
    ? `run \`${commands.listed}\``
    : `rerun ${stackRerunTarget(rerunCommand)} with those PRs listed after \`stack\``;
  const approval = commands
    ? `If they approve, run that same command, or \`${commands.whole}\` (the stack number owns every layer). Otherwise wait for ${owner}.`
    : `They either approve it, and you ${listAll}, or wait for ${owner}.`;
  return escalation(
    `\`unowned-stack-layers\`: merging PR #${target.pr} also merges ${describeLayers(unlisted)}, which you did not list as yours. Nothing was merged, and never merge only #${target.pr} while leaving ${them} open. If the user's request already covers ${them} (they asked for the whole stack, or for every layer up to #${target.pr}), ${listAll} now. Otherwise stop and tell the user that merging #${target.pr} also merges ${list(unlisted)}. ${approval}`,
  );
}

export const list = (items: PollSummaryItem[]): string => items.map((i) => `#${i.pr}`).join(", ");

/** Layers that joined the stack after the merge was requested: the request never covered them. */
export function addedLayersEscalation(
  result: PollSummaryResult,
  open: PollSummaryItem[],
  scope: StackMergeScope,
  rerunCommand?: string,
): StackPlan | undefined {
  const added = result.addedLayers ?? [];
  if (added.length === 0) return undefined;
  const approved = open.filter((item) => !added.includes(item.pr));
  const lastApproved = approved.reduce<PollSummaryItem | undefined>(
    (top, item) => (!top || stackPosition(item) > stackPosition(top) ? item : top),
    undefined,
  );
  const above =
    !!lastApproved &&
    !open.some(
      (item) => added.includes(item.pr) && stackPosition(item) < stackPosition(lastApproved),
    );
  const recovery = !lastApproved
    ? "If no, merge nothing."
    : above
      ? `If no, rerun with \`--merge-through ${lastApproved.pr}\`, the last approved PR.`
      : "If no, do not use `--merge-through`: the new layer sits below an approved one and would land with it. Rerun with only the approved PRs listed after `stack`, which stops at the unowned layer, or wait for its owner.";
  const request =
    scope.kind === "ready"
      ? "so `--merge-ready` does not cover "
      : "so the request does not cover ";
  return escalation(
    `\`unapproved-stack-layer\`: ${added.map((pr) => `PR #${pr}`).join(", ")} joined this stack after the merge was requested, ${request}${added.length === 1 ? "it" : "them"}. Nothing was merged. Stop and ask the user whether ${added.length === 1 ? "that layer is" : "those layers are"} covered. If yes, rerun ${stackRerunTarget(rerunCommand)} with the covered PRs listed explicitly after \`stack\`. ${recovery}`,
  );
}

export function scopeDone(open: PollSummaryItem[]): StackPlan {
  const many = open.length !== 1;
  return {
    action: "cancel",
    stackMergeable: true,
    instructions: [
      `1. Stop — every layer in the merge scope is merged. ${list(open)} ${many ? "stay" : "stays"} open outside it; leave ${many ? "them" : "it"} to ${many ? "their" : "its"} owner.`,
    ],
  };
}

export function escalation(text: string): StackPlan {
  return { action: "escalate", stackMergeable: false, instructions: [`1. ${text}`] };
}

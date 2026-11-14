import { AsyncLocalStorage } from "node:async_hooks";
import type { StackLayerOwnership } from "../../types.mts";

interface Boundary {
  pr: number | undefined;
  layers: StackLayerOwnership[];
}

const storage = new AsyncLocalStorage<Boundary>();

/** Run one iterate tick with the stack ownership its command carried. */
export function withStackBoundary<T>(
  pr: number | undefined,
  layers: StackLayerOwnership[] | undefined,
  run: () => Promise<T>,
): Promise<T> {
  return layers?.some((layer) => !layer.owned) ? storage.run({ pr, layers }, run) : run();
}

/** `pr:position:o|u:branch` per layer, comma separated: the `--layers` value. The branch is percent-encoded so commas and colons survive. */
export function formatStackLayers(layers: StackLayerOwnership[]): string {
  return layers
    .map((l) => `${l.pr}:${l.position}:${l.owned ? "o" : "u"}:${encodeURIComponent(l.branch)}`)
    .join(",");
}

function decodeBranch(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** Parse a `--layers` value; null when any entry is malformed. */
export function parseStackLayers(value: string): StackLayerOwnership[] | null {
  const layers: StackLayerOwnership[] = [];
  for (const entry of value.split(",")) {
    const match = /^(\d+):(\d+):([ou]):(.+)$/.exec(entry);
    const branch = match ? decodeBranch(match[4]!) : null;
    if (!match || !branch) return null;
    layers.push({
      pr: Number(match[1]),
      position: Number(match[2]),
      owned: match[3] === "o",
      branch,
    });
  }
  return layers.length > 0 ? layers : null;
}

const PUSH_REMOTE =
  "(substitute this repository's push remote for `<push-remote>`, the remote `gh stack push` uses)";

interface Plan {
  unowned: StackLayerOwnership[];
  /** The caller's layers this session may restack and push, bottom first; empty when blocked. */
  pushable: StackLayerOwnership[];
  blockedBy?: StackLayerOwnership[];
  me?: StackLayerOwnership;
}

function plan(): Plan | undefined {
  const boundary = storage.getStore();
  if (!boundary) return undefined;
  const layers = [...boundary.layers].sort((a, b) => a.position - b.position);
  const unowned = layers.filter((layer) => !layer.owned);
  const me = layers.find((layer) => layer.pr === boundary.pr && layer.owned);
  if (!me) return { unowned, pushable: [] };
  const below = layers.filter((layer) => layer.position <= me.position);
  const blockedBy = below.filter((layer) => !layer.owned);
  return {
    unowned,
    me,
    pushable: blockedBy.length > 0 ? [] : below,
    ...(blockedBy.length > 0 && { blockedBy }),
  };
}

const names = (layers: StackLayerOwnership[]): string => layers.map((l) => `#${l.pr}`).join(", ");

/**
 * Whether the ownership this tick carries rules out a whole-stack `gh stack rebase` / `push`
 * (some layer is not the caller's), and the instruction to give instead; undefined otherwise.
 */
export function boundedStackRebase(
  stackNumber: number,
  playbook: string,
  rest = false,
): string | undefined {
  const p = plan();
  if (!p) return undefined;
  const lead = `Unowned ${p.unowned.length === 1 ? "layer" : "layers"} ${names(p.unowned)} in native stack #${stackNumber} must not be rebased or pushed, and a whole-stack update (\`gh stack rebase\`, \`gh stack push\`) would rewrite ${p.unowned.length === 1 ? "it" : "them"}, so do not run one.`;
  if (!p.me) {
    return `${lead} This session cannot tell which layers are owned; do not update any branch of the stack, and report that to the caller. ${playbook}`;
  }
  if (p.blockedBy) {
    return `${lead} ${names(p.blockedBy)} sits below this PR, so no branch of this PR can be restacked without rewriting ${p.blockedBy.length === 1 ? "it" : "them"}. Do not rebase or push; report that PR #${p.me.pr} waits on ${p.blockedBy.length === 1 ? "that layer's" : "those layers'"} owner. ${playbook}`;
  }
  const above = p.unowned.filter((layer) => layer.position > p.me!.position);
  const stale =
    above.length > 0
      ? ` ${names(above)} will be stale afterwards: tell the user its owner must restack ${above.length === 1 ? "it" : "them"}.`
      : "";
  const update = rest
    ? `Instead, update only PR #${p.me.pr} (\`${p.me.branch}\`) and the layers below it, using the repository's stack-update procedure.`
    : `Instead, from a clean checkout, if \`gh stack\` does not track stack #${stackNumber} locally, import it with \`gh stack checkout ${stackNumber}\`; then check out \`${p.me.branch}\` (PR #${p.me.pr}) and run \`gh stack rebase --downstack\`, which rewrites only this layer and the layers below it.`;
  return `${lead} ${update}${stale} ${playbook}`;
}

/**
 * The push clause that replaces "push the rewritten stack with `gh stack push`" when ownership
 * is bounded; undefined when it is not.
 */
export function boundedStackPush(): string | undefined {
  const p = plan();
  if (!p) return undefined;
  if (p.pushable.length === 0) {
    return "do not push the stack: `gh stack push` would publish unowned layers, and this PR has no branch it can restack alone";
  }
  const branches = p.pushable.map((layer) => `\`${layer.branch}\``).join(", ");
  return `push only the owned branches (${branches}) with \`git push --force-with-lease <push-remote> <branch>\` ${PUSH_REMOTE}; do not run \`gh stack push\`, which would also publish unowned layers (${names(p.unowned)})`;
}

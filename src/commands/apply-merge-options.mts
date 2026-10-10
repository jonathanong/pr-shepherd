import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { RestMergeOptions } from "../github/rest-merge.mts";
import {
  restMergeStackGuardKey,
  validateRestMergeStackGuard,
} from "../github/rest-merge-stack-guard.mts";

export function validateApplyMergeOptions(input: RestMergeOptions): void {
  if (input.expectedStack !== undefined) {
    try {
      validateRestMergeStackGuard(input.expectedStack);
    } catch (error) {
      throw new ShepherdError(error instanceof Error ? error.message : String(error), EXIT.DATAERR);
    }
    if (input.expectedStack.prefix.at(-1)?.headRefOid !== input.requireSha)
      throw new ShepherdError("expectedStack prefix head must match --require-sha", EXIT.DATAERR);
  }
  if (typeof input.requireSha !== "string" || !/^[0-9a-f]{40}$/.test(input.requireSha))
    throw new ShepherdError(
      "--require-sha must be a full 40-character lowercase hex SHA",
      EXIT.DATAERR,
    );
  if (!["direct_merge", "merge_queue", "default"].includes(input.mergeAction))
    throw new ShepherdError(
      "--merge-action must be direct_merge, merge_queue, or default",
      EXIT.USAGE,
    );
  if (input.mergeMethod !== undefined && !["merge", "squash", "rebase"].includes(input.mergeMethod))
    throw new ShepherdError("--method must be merge, squash, or rebase", EXIT.USAGE);
  if (input.mergeMethod !== undefined && input.mergeAction !== "direct_merge")
    throw new ShepherdError(
      "--method is supported only with --merge-action direct_merge",
      EXIT.USAGE,
    );
}

export function sameMergeOptions(left: RestMergeOptions, right: RestMergeOptions): boolean {
  return (
    left.requireSha === right.requireSha &&
    left.mergeAction === right.mergeAction &&
    left.mergeMethod === right.mergeMethod &&
    restMergeStackGuardKey(left.expectedStack) === restMergeStackGuardKey(right.expectedStack)
  );
}

export function validateApplyMergeTarget(input: RestMergeOptions, pr: number | undefined): void {
  if (
    pr !== undefined &&
    input.expectedStack !== undefined &&
    input.expectedStack.prefix.at(-1)?.pr !== pr
  )
    throw new ShepherdError("expectedStack prefix must end at the requested PR", EXIT.DATAERR);
}

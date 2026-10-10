import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { RestMergeOptions } from "../github/rest-merge.mts";

export function validateApplyMergeOptions(input: RestMergeOptions): void {
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
    left.mergeMethod === right.mergeMethod
  );
}

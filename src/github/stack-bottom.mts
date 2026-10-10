import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { StackMemberRefs } from "./stack-read.mts";

/** The first open member can replace merged lower layers only after a fully merged prefix. */
export function verifiedBottomOpenLayer<Pr extends StackMemberRefs>(
  ordered: readonly Pr[],
  anchor: number,
): Pr {
  const index = ordered.findIndex((member) => member.state === "OPEN");
  const bottom = ordered[index];
  if (!bottom) {
    throw new ShepherdError(`Native stack for PR #${anchor} has no open layer`, EXIT.TEMPFAIL);
  }
  const predecessor = ordered.slice(0, index).find((member) => member.state !== "MERGED");
  if (predecessor) {
    throw new ShepherdError(
      `Native stack for PR #${anchor} has PR #${predecessor.number} in state ${predecessor.state} before open PR #${bottom.number}; cannot verify the bottom open layer`,
      EXIT.TEMPFAIL,
    );
  }
  return bottom;
}

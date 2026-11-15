import { readStallRepair, writeStallRepair } from "../../state/stall-repair.mts";
import type { IterateResult, IterateResultBase, ShepherdReport } from "../../types.mts";
import { buildUnreportedFixResult } from "./unreported-required.mts";

/** One repair step; the unchanged failure on the next poll escalates `stall-state-unavailable`. */
export function stallRepairStep(reason: string): string {
  return `The stall timer could not be saved (${reason}). Fix PR_SHEPHERD_STATE_DIR or the state directory's permissions, then rerun Shepherd. Until it can be saved Shepherd cannot detect a stuck loop; if it still cannot be saved on the next poll, Shepherd escalates \`stall-state-unavailable\`.`;
}

/**
 * The first time a stall timer cannot be saved: the tick's own work plus one repair step (a
 * `triage` when the tick had none). `undefined` (escalate) once that repair tick was already
 * presented for this reason, or when the marker that bounds it cannot be saved.
 */
export async function planStallRepair(input: {
  base: IterateResultBase;
  report: ShepherdReport;
  prospective: IterateResult;
  scope: string;
  reason: string;
  /** Internal preview ticks must not consume the one repair tick. */
  persistState: boolean;
}): Promise<IterateResult | undefined> {
  const { base, report, prospective, scope, reason, persistState } = input;
  if (await readStallRepair(scope, reason)) return undefined;
  if (persistState && !(await writeStallRepair(scope, reason))) return undefined;
  const step = stallRepairStep(reason);
  if (prospective.action !== "triage") return buildUnreportedFixResult(base, report, [step]);
  return {
    ...prospective,
    triage: { ...prospective.triage, instructions: [step, ...prospective.triage.instructions] },
  };
}

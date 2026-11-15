import type {
  AgentStalledCheck,
  IterateResult,
  IterateResultBase,
  ShepherdReport,
} from "../../types.mts";
import {
  ciStartSignature,
  readCiStartFollowUp,
  writeCiStartFollowUp,
} from "../../state/ci-start-follow-up.mts";
import { playbookPointer } from "../playbook-pointer.mts";
import { buildUnreportedFixResult } from "./unreported-required.mts";

type StateKey = { owner: string; repo: string; pr: number };

/** Constant text: the checks' names, URLs and summaries are data under `## Unstarted checks`. */
const CI_START_INSTRUCTIONS = [
  `The checks under \`## Unstarted checks\` have not started after the stall timeout, and Shepherd cannot tell from GitHub's data why. Find out before acting. ${playbookPointer("CI start stall")}`,
  "If the cause is within this PR, fix it and push. Otherwise make no change and keep what you found. If the same checks are still not started on the next poll, Shepherd escalates with `stall-timeout`; report your diagnosis then.",
];

/**
 * One bounded investigation `triage` the first time unstarted checks stall on a head; `undefined`
 * (escalate) once the same checks on the same head were already presented, or at once when a
 * stalled check waits on a deployment-environment approval.
 */
export async function planCiStartInvestigation(input: {
  base: IterateResultBase;
  report: ShepherdReport;
  stallKey: StateKey;
  headSha: string;
  stalledChecks: readonly AgentStalledCheck[];
  /** Internal preview ticks must not consume the one investigation tick. */
  persistState: boolean;
  /** The escalation when the investigation marker cannot be saved. */
  stateUnavailable: (reason: string) => IterateResult;
}): Promise<IterateResult | undefined> {
  const { base, report, stallKey, headSha, stalledChecks, persistState } = input;
  // A deployment-environment approval is a known human gate: nothing to investigate.
  if (stalledChecks.some((check) => check.pendingDeployments?.length)) return undefined;
  const signature = ciStartSignature(
    headSha,
    stalledChecks.map((check) => check.name),
  );
  if (await readCiStartFollowUp(stallKey, signature)) return undefined;
  // A reused cached report is re-run by the poll before it is shown, so it must not spend the one
  // investigation tick the caller never sees. A marker that cannot be saved would repeat the
  // investigation forever, so that escalates with the save error.
  if (persistState && report.fingerprintReused !== true) {
    const saveError = await writeCiStartFollowUp(stallKey, signature);
    if (saveError) return input.stateUnavailable(saveError);
  }
  return buildUnreportedFixResult(base, report, CI_START_INSTRUCTIONS, {
    stalledChecks: [...stalledChecks],
  });
}

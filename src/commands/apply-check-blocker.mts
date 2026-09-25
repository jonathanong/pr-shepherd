import { getCurrentPrNumber, getRepoInfo } from "../github/client.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import {
  clearCheckBlocker,
  writeCheckBlocker,
  type CheckBlockerRecord,
  type CheckBlockerRef,
} from "../state/check-blockers.mts";

export interface CheckBlockerCommandResult {
  checkName: string;
  blocker?: CheckBlockerRef;
  recordedAt?: number;
}

type ApplyInput = {
  prNumber?: number;
  targetRepository?: { owner: string; name: string };
  checkName: string;
} & ({ clear: true } | { blocker: CheckBlockerRef });

export function formatCheckBlockerResult(result: CheckBlockerCommandResult): string {
  const lines = [`checkName: ${result.checkName}`];
  if (result.blocker) {
    lines.push(
      `blocker.owner: ${result.blocker.owner}`,
      `blocker.name: ${result.blocker.name}`,
      `blocker.number: ${result.blocker.number}`,
      `blocker.kind: ${result.blocker.kind}`,
    );
  }
  if (result.recordedAt !== undefined) lines.push(`recordedAt: ${result.recordedAt}`);
  return lines.join("\n");
}

/** Record or clear one check blocker. Validates the PR, then writes per-PR state. */
export async function applyCheckBlocker(input: ApplyInput): Promise<CheckBlockerCommandResult> {
  const repo = input.targetRepository ?? (await getRepoInfo());
  const pr = input.prNumber ?? (await getCurrentPrNumber());
  if (pr === null) {
    throw new ShepherdError(
      "No open PR found for current branch. Pass a PR number explicitly.",
      EXIT.UNAVAILABLE,
    );
  }
  const key = { owner: repo.owner, repo: repo.name, pr };
  if ("clear" in input) {
    if (!(await clearCheckBlocker(key, input.checkName))) {
      throw new ShepherdError("Could not write check blocker state.", EXIT.UNAVAILABLE);
    }
    return { checkName: input.checkName };
  }
  const record: CheckBlockerRecord = {
    checkName: input.checkName,
    blocker: input.blocker,
    recordedAt: Math.floor(Date.now() / 1000),
  };
  if (!(await writeCheckBlocker(key, record))) {
    throw new ShepherdError("Could not write check blocker state.", EXIT.UNAVAILABLE);
  }
  return record;
}

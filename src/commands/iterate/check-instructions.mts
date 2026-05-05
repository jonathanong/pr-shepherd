import type { AgentCheck } from "../../types.mts";

export function buildFailingCheckInstructions(checks: AgentCheck[]): string[] {
  const instructions: string[] = [];
  const failedRunIdChecks = checks.filter(
    (c) => c.runId && c.conclusion !== "CANCELLED" && c.conclusion !== "STARTUP_FAILURE",
  );
  const cancelledRunIdChecks = checks.filter((c) => c.runId && c.conclusion === "CANCELLED");
  const startupFailureRunIdChecks = checks.filter(
    (c) => c.runId && c.conclusion === "STARTUP_FAILURE",
  );
  const externalChecks = checks.filter((c) => !c.runId && c.detailsUrl);
  const bareChecks = checks.filter((c) => !c.runId && !c.detailsUrl);
  if (failedRunIdChecks.length > 0) {
    instructions.push(
      `For each failing check under \`## Failing checks\` with a run ID and no \`[conclusion: CANCELLED]\` or \`[conclusion: STARTUP_FAILURE]\` tag: run \`gh run view <runId> --log-failed\` to fetch the failing job's log.`,
      `If the log shows a transient infrastructure failure (network timeout, runner setup crash, OOM kill): run \`gh run rerun <runId> --failed\`.`,
      `If the log shows a real test/build failure: apply a code fix.`,
    );
  }
  if (cancelledRunIdChecks.length > 0) {
    instructions.push(
      `For each \`[conclusion: CANCELLED]\` bullet under \`## Failing checks\`: the run was cancelled outside Shepherd's control (manual cancel, newer push, concurrency-group eviction). Run \`gh run rerun <runId>\` only if the cancellation looks unintended; otherwise treat it as resolved by the superseding run. Do NOT confuse these with IDs under \`## Cancelled runs\` — those were cancelled by Shepherd itself.`,
    );
  }
  if (startupFailureRunIdChecks.length > 0) {
    instructions.push(
      `For each \`[conclusion: STARTUP_FAILURE]\` bullet under \`## Failing checks\`: the workflow failed before jobs/logs were created. Run \`gh run view <runId>\` to inspect the run metadata, then run \`gh run rerun <runId>\` if the workflow should be attempted again.`,
    );
  }
  if (externalChecks.length > 0) {
    instructions.push(
      `For each bullet in \`## Failing checks\` starting with \`external\` (external status check): open the linked URL in a browser to inspect the failure — log tails are not available for external checks.`,
    );
  }
  if (bareChecks.length > 0) {
    instructions.push(
      `For each bullet in \`## Failing checks\` starting with \`(no runId)\`: there is no run or details URL to inspect. Escalate these to a human — they require manual investigation outside the pr-shepherd flow.`,
    );
  }
  return instructions;
}

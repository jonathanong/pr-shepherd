import type { InProgressRun } from "../types.mts";

/** One `## In-progress runs` bullet: the run, its raw `concurrency`, and the cancel command if any. */
export function renderInProgressRun(run: InProgressRun): string {
  const siblings =
    run.failed && run.running
      ? ` failed: ${run.failed.join(", ")} · running: ${run.running.join(", ")}`
      : "";
  const protectedTag = run.neverCancel ? ` [never-cancel: ${run.neverCancel}]` : "";
  const lines = [
    `- \`${run.runId}\` — \`${run.workflowName}\` [status: ${run.status}]${protectedTag}${siblings}`,
    `  concurrency: ${run.concurrency}`,
  ];
  if (run.cancelCommand) lines.push(`  cancel: \`${run.cancelCommand}\``);
  return lines.join("\n");
}

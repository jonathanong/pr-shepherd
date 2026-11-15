import type { PendingDeployment } from "../types.mts";

function renderReviewer(reviewer: NonNullable<PendingDeployment["reviewers"]>[number]): string {
  return reviewer.type === "Team" ? `team \`${reviewer.name}\`` : `\`@${reviewer.name}\``;
}

/** One environment approval, as raw fields: name, required reviewers, viewer capability, timer. */
export function formatPendingDeployment(deployment: PendingDeployment): string {
  const parts = [`environment \`${deployment.environment}\``];
  if (deployment.reviewers) {
    parts.push(`required reviewers ${deployment.reviewers.map(renderReviewer).join(", ")}`);
  }
  parts.push(`viewer can approve: ${deployment.currentUserCanApprove ? "yes" : "no"}`);
  if (deployment.waitTimerMinutes !== undefined) {
    parts.push(`wait timer ${deployment.waitTimerMinutes} min`);
  }
  return parts.join(", ");
}

/** Shared text rendering of environment approvals under a check bullet. */
export function renderPendingDeploymentLines(
  deployments: PendingDeployment[] | undefined,
  indent = "  ",
): string[] {
  return (deployments ?? []).map(
    (d) => `${indent}pending deployment: ${formatPendingDeployment(d)}`,
  );
}

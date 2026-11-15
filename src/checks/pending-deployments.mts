import { restWithRateLimit } from "../github/http.mts";
import type { RepoInfo } from "../github/client.mts";
import type { StateKey } from "../state/rest-cache.mts";
import type { CheckRun, PendingDeployment } from "../types.mts";
import { mapPool } from "../util/pool.mts";
import { TriageBudget } from "./triage-budget.mts";

interface PendingDeploymentsItem {
  environment?: { name?: string | null } | null;
  wait_timer?: number | null;
  current_user_can_approve?: boolean | null;
  reviewers?: Array<{
    type?: string | null;
    reviewer?: { login?: string | null; slug?: string | null } | null;
  }> | null;
}

type ReviewerList = NonNullable<PendingDeployment["reviewers"]>;

/**
 * A run can be held by an environment protection rule. GitHub reports it as a check with status
 * `WAITING`; the "approve and run" gate for fork or first-time contributors reports
 * `ACTION_REQUIRED` instead. Either may have pending deployments, so both are asked.
 */
function mayHavePendingDeployments(check: CheckRun): boolean {
  return (
    check.runId !== null && (check.status === "WAITING" || check.conclusion === "ACTION_REQUIRED")
  );
}

function toPendingDeployments(raw: PendingDeploymentsItem[]): PendingDeployment[] {
  return raw.flatMap((item) => {
    const environment = item.environment?.name;
    if (!environment) return [];
    const reviewers = (item.reviewers ?? []).flatMap((r): ReviewerList => {
      const name = r.reviewer?.login ?? r.reviewer?.slug;
      if (!name) return [];
      return r.type === "User" || r.type === "Team" ? [{ type: r.type, name }] : [];
    });
    return [
      {
        environment,
        currentUserCanApprove: item.current_user_can_approve === true,
        ...(reviewers.length > 0 && { reviewers }),
        ...(typeof item.wait_timer === "number" &&
          item.wait_timer > 0 && { waitTimerMinutes: item.wait_timer }),
      },
    ];
  });
}

async function fetchRunPendingDeployments(
  runId: string,
  repo: RepoInfo,
  stateKey: StateKey | undefined,
  budget: TriageBudget,
): Promise<PendingDeployment[]> {
  if (!budget.canScheduleOptional()) return [];
  try {
    const { data, rateLimit } = await restWithRateLimit<PendingDeploymentsItem[]>(
      "GET",
      `/repos/${repo.owner}/${repo.name}/actions/runs/${runId}/pending_deployments`,
      undefined,
      stateKey
        ? { conditional: { key: stateKey, name: `pending-deployments-run-${runId}` } }
        : undefined,
    );
    budget.observe(rateLimit);
    return Array.isArray(data) ? toPendingDeployments(data) : [];
  } catch (error) {
    budget.observeError(error);
    return [];
  }
}

/**
 * Attaches the raw pending-deployment data to checks whose run may be waiting on an environment
 * approval. One conditional REST read per distinct run, and none when no such check exists. A
 * failed read leaves the check as it was; an empty answer (fork gate) adds nothing.
 */
export async function attachPendingDeployments<T extends CheckRun>(
  checks: T[],
  repo: RepoInfo,
  stateKey?: StateKey,
  budget = new TriageBudget(),
): Promise<T[]> {
  const runIds = [...new Set(checks.filter(mayHavePendingDeployments).map((c) => c.runId!))];
  if (runIds.length === 0) return checks;
  const byRun = new Map<string, PendingDeployment[]>();
  await mapPool(runIds, 4, async (runId) => {
    byRun.set(runId, await fetchRunPendingDeployments(runId, repo, stateKey, budget));
  });
  return checks.map((check) => {
    const pending = check.runId === null ? undefined : byRun.get(check.runId);
    return pending && pending.length > 0 ? { ...check, pendingDeployments: pending } : check;
  });
}

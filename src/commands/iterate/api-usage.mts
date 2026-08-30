import { loadConfig } from "../../config/load.mts";
import { summarizeApiTelemetry } from "../../github/api-telemetry.mts";
import { evaluateWorktreeGraphqlQuotaWarning } from "../../state/graphql-quota-warnings.mts";
import type { IterateResult } from "../../types.mts";
import { buildQuotaAwareContinuation } from "../../quota-warning.mts";

function shouldWarn(result: IterateResult): boolean {
  if (["wait", "mark_ready", "merge"].includes(result.action)) return true;
  if (result.action !== "fix_code") return false;
  return !result.fix.instructions.some((instruction) =>
    /stop polling|human direction/i.test(instruction),
  );
}

export async function attachApiUsage(
  result: IterateResult,
  snapshot: number,
  persistWarning: boolean,
): Promise<IterateResult> {
  const apiUsage = summarizeApiTelemetry(snapshot);
  if (apiUsage === undefined) return result;

  let quotaWarning;
  if (apiUsage.graphql !== undefined && shouldWarn(result)) {
    const [owner, repo] = result.repo.split("/");
    if (owner && repo) {
      quotaWarning = await evaluateWorktreeGraphqlQuotaWarning(
        { owner, repo },
        loadConfig().watch.graphqlQuotaWarnings,
        apiUsage.graphql,
        persistWarning,
      );
    }
  }

  const withWarning: IterateResult = {
    ...result,
    apiUsage,
    ...(quotaWarning !== undefined && { quotaWarning }),
  };
  if (quotaWarning === undefined || withWarning.action !== "fix_code") return withWarning;

  const instructions = [...withWarning.fix.instructions];
  const completion = instructions.at(-1);
  if (completion !== undefined && /\[FIX_CODE\].*non-terminal/i.test(completion)) {
    instructions[instructions.length - 1] = buildQuotaAwareContinuation(
      quotaWarning,
      "`[FIX_CODE]` is non-terminal. After completing these steps,",
    );
  }
  return { ...withWarning, fix: { ...withWarning.fix, instructions } };
}

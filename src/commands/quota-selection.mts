import type { GraphqlQuotaWarningBand } from "../config/load.mts";
import { withGraphqlCredentialFingerprint } from "../github/api-telemetry.mts";
import { composeQuotaWarning } from "../quota-budgets.mts";
import { evaluateWorktreeGraphqlQuotaWarning } from "../state/graphql-quota-warnings.mts";
import type { ApiUsage, GraphqlQuotaWarning } from "../types.mts";

/** Claim GraphQL and REST core warnings separately, then present one result. */
export async function selectQuotaWarning(
  key: { owner: string; repo: string },
  bands: GraphqlQuotaWarningBand[],
  usage: ApiUsage,
  persist: boolean,
): Promise<GraphqlQuotaWarning | undefined> {
  const core = usage.rest?.find((item) => item.resource === "core");
  const graphqlWarning = usage.graphql
    ? await evaluateWorktreeGraphqlQuotaWarning(
        key,
        bands,
        withGraphqlCredentialFingerprint(usage.graphql),
        persist,
      )
    : undefined;
  const coreWarning = core
    ? await evaluateWorktreeGraphqlQuotaWarning(
        key,
        bands,
        withGraphqlCredentialFingerprint(core),
        persist,
      )
    : undefined;
  return composeQuotaWarning({
    graphqlWarning,
    coreWarning,
    graphql: usage.graphql,
    core,
    bands,
  });
}

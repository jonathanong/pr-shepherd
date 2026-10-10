import type { GraphqlQuotaWarningBand } from "../config/load.mts";
import { withGraphqlCredentialFingerprint } from "../github/api-telemetry.mts";
import { composeQuotaWarning } from "../quota-budgets.mts";
import { evaluateWorktreeGraphqlQuotaWarning } from "../state/graphql-quota-warnings.mts";
import type { ApiUsage, GraphqlQuotaWarning } from "../types.mts";
import type { GithubTransport } from "../github/transport.mts";

/** Claim GraphQL and REST core warnings separately, then present one result. */
export async function selectQuotaWarning(
  key: { owner: string; repo: string },
  bands: GraphqlQuotaWarningBand[],
  usage: ApiUsage,
  persist: boolean,
  transport?: Exclude<GithubTransport, "auto">,
): Promise<GraphqlQuotaWarning | undefined> {
  const core = usage.rest?.find((item) => item.resource === "core");
  const graphql = transport === "rest" ? undefined : usage.graphql;
  const graphqlWarning = graphql
    ? await evaluateWorktreeGraphqlQuotaWarning(
        key,
        bands,
        withGraphqlCredentialFingerprint(graphql),
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
    graphql,
    core,
    bands,
  });
}

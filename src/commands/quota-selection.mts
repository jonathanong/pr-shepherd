import type { GraphqlQuotaWarningBand } from "../config/load.mts";
import {
  withGraphqlCredentialFingerprint,
  withRestCoreCredentialFingerprint,
} from "../github/api-telemetry.mts";
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
  // Capture provenance together with this usage snapshot before either async
  // state evaluation can yield while newer requests update telemetry.
  const graphqlSample = graphql ? withGraphqlCredentialFingerprint(graphql) : undefined;
  const coreSample = core ? withRestCoreCredentialFingerprint(core) : undefined;
  const graphqlWarning = graphqlSample
    ? await evaluateWorktreeGraphqlQuotaWarning(key, bands, graphqlSample, persist)
    : undefined;
  const coreWarning = coreSample
    ? await evaluateWorktreeGraphqlQuotaWarning(key, bands, coreSample, persist)
    : undefined;
  return composeQuotaWarning({
    graphqlWarning,
    coreWarning,
    graphql,
    core,
    bands,
  });
}

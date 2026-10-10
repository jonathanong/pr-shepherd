import { getGithubTransport, isCcrTransport } from "./transport.mts";

export type GithubMutationOperation =
  | "reply"
  | "resolve"
  | "dismiss"
  | "ready"
  | "minimize"
  | "view";

/**
 * Whether iterate may generate a mutation from the capability data available on
 * this transport. Explicit `apply` requests do not use this policy.
 */
export function canGenerateGithubMutation(
  capability: boolean | undefined,
  operation: GithubMutationOperation,
): boolean {
  if (capability === false) return false;
  const transport = getGithubTransport();
  if (transport === "graphql") return capability === true;
  if (operation === "minimize" || operation === "view") return false;
  if (operation === "resolve" || operation === "ready") return isCcrTransport();
  if (capability === true) return true;
  if (operation === "reply" || operation === "dismiss") return true;
  return false;
}

/** Text the Claude Code cloud proxy returns, with HTTP 403, for every GraphQL request. */
const CCR_GRAPHQL_REFUSAL = "GitHub GraphQL is not available from Claude Code sessions";

/**
 * Whether a GraphQL response is the Claude Code cloud proxy's blanket refusal. Inspects the raw
 * body, because the proxy appends a long list of REST routes that pushes the refusal past the
 * truncated error message.
 */
export function isCcrGraphqlRefusal(status: number, raw: string): boolean {
  return status === 403 && raw.includes(CCR_GRAPHQL_REFUSAL);
}

/** Exit-77 message for an explicit `--transport graphql` run inside a Claude Code cloud session. */
export const CCR_GRAPHQL_REFUSAL_MESSAGE =
  "GitHub GraphQL is not available from Claude Code sessions (HTTP 403 from the Claude Code proxy). " +
  "Rerun with `--transport rest` or `--transport auto` (the default), or set `github.transport` " +
  "to `rest` or `auto`.";

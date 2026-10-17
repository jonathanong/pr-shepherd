# GitHub authentication and token access

[← README](../README.md)

Which credential Shepherd uses, what permissions it needs, and how quota is shared between tokens. For anyone setting up a token or debugging a permission failure. Without a usable token, iterate fails before emitting an action.

## Token resolution

| Order | Source                         |
| ----- | ------------------------------ |
| 1     | `GH_TOKEN`                     |
| 2     | `GITHUB_TOKEN`                 |
| 3     | `gh auth token`                |
| 4     | `GITHUB_PERSONAL_ACCESS_TOKEN` |

GraphQL and REST requests in one process use the same resolved credential. Verbose telemetry and request failures report the source label, never the token value.

Transport selection (`github.transport`, `--transport`) is in [github-api.md](github-api.md#transport-selection). In Claude Code cloud sessions the environment token may be a placeholder: do not validate it locally or trust `gh auth status`. Requests go through the configured `HTTP_PROXY`/`HTTPS_PROXY`, which supplies credentials; Node's HTTP client honors the proxy and its CA bundle, and TLS verification stays on.

## Quota sharing

GitHub meters GraphQL separately from REST `core` ([github-api.md](github-api.md#github-metering)).

| Token                                | GraphQL budget                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| User access tokens, including PATs   | The user's budget, shared by every token of that user (GitHub MCP, `gh api graphql`, a second PAT) |
| GitHub App user access token         | The user's budget                                                                                  |
| GitHub App installation access token | Installation-scoped                                                                                |

For quota isolation use an installation token or a different GitHub user. A dedicated PAT still helps least privilege and audit.

## Permissions

Fine-grained PATs are recommended. Select the repository that contains the PR and grant:

| Permission      | Access         | Used for                                                                           |
| --------------- | -------------- | ---------------------------------------------------------------------------------- |
| Metadata        | Read           | Repository identity; GitHub includes it automatically                              |
| Contents        | Read           | Commit, branch, and content context. Shepherd never pushes through the API         |
| Pull requests   | Read and write | PR state, files, reviews, review threads, and review mutations                     |
| Issues          | Read and write | Reading, replying to, and minimizing PR conversation comments (issue-comment APIs) |
| Actions         | Read           | Workflow runs, jobs, and logs. Shepherd never reruns or cancels runs               |
| Commit statuses | Read           | Third-party status contexts in the PR rollup                                       |

Fine-grained PATs have no separate Checks permission: Actions covers Actions check runs and logs, and Commit statuses covers status contexts. The Workflows permission controls workflow-file changes, not runs, and is not needed. For a classic PAT, grant `repo`.

The token owner also needs repository access for the operation; organization approval, SAML SSO, and repository-selection policies can restrict a token independently of its permissions.

GitHub references:

- [Managing fine-grained personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Fine-grained PAT permissions](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)
- [Workflow runs API permissions](https://docs.github.com/en/rest/actions/workflow-runs)
- [Commit statuses API permissions](https://docs.github.com/en/rest/commits/statuses)

## Capabilities versus scope

Token scope does not prove the viewer may perform an action.

| Case                             | Behavior                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------- |
| GraphQL capability fields        | Filter generated mutations                                                      |
| REST (no capability fields)      | Otherwise-eligible supported mutations are attempted; GitHub's response decides |
| Denied automatic review mutation | Shown once and skipped; does not count toward fix attempts                      |
| Denied automatic mark-ready      | `ESCALATE` with `authorization-required`                                        |
| Explicit `apply`                 | Always attempted per its transport contract                                     |

## Claude Code proxy refusals

A proxy session refusal differs from a GitHub permission denial. Responses naming `not enabled for this session`, `sessions are bound`, or an Anthropic documentation URL stop review mutations with exit `77` and keep the proxy's message. They do not mark the item denied, so a retry after access is repaired works without editing the comment. A refusal during mark-ready uses `transport-unsupported` and quotes the message. Follow the proxy's repository-access instructions; when it asks for API or write access, call `add_repo` with `access: "push"`.

Cloud VM rebuilds can erase the default temp state directory, including pending reply and merge receipts. Set `PR_SHEPHERD_STATE_DIR` to persistent storage when available ([cloud.md](cloud.md#durable-state)).

## Permission failures

Missing access usually shows as `403 Resource not accessible by personal access token`. Read failures are fatal, because partial PR, review, or check data could drive an unsafe transition: `iterate` and `pr-shepherd [PR]` exit `77` (`EX_NOPERM`) instead of emitting an action from an incomplete snapshot. The recognized Claude Code GraphQL-blocked response is a transport switch, not a permission failure; a secondary rate limit exits `75` (`EX_TEMPFAIL`) without switching. See [exit-codes.md](exit-codes.md).

To fix: read the error's GraphQL path to find the field, update the token permission or repository selection, and retry. `pr-shepherd admin log-file` locates the request log.

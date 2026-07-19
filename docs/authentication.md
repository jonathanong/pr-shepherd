# GitHub authentication and token access

[← README](../README.md)

pr-shepherd accepts a GitHub personal access token (PAT) from the environment or uses the authenticated GitHub CLI. Token resolution order is:

1. `GH_TOKEN`
2. `GITHUB_TOKEN`
3. `gh auth token`
4. `GITHUB_PERSONAL_ACCESS_TOKEN`

Fine-grained PATs are recommended. Select the repository that contains the pull request and grant these repository permissions for the complete pr-shepherd workflow:

| Permission      | Access         | Used for                                                                                                                                                             |
| --------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metadata        | Read           | Repository identity and other baseline repository metadata. GitHub includes this permission automatically.                                                           |
| Contents        | Read           | Commit, branch, and repository content context. pr-shepherd itself never pushes through the GitHub API.                                                              |
| Pull requests   | Read and write | Read PR state, files, reviews, and review threads; mark files viewed; reply to and resolve review threads; dismiss reviews; mark drafts ready; and update PR bodies. |
| Issues          | Read and write | Read, reply to, and minimize PR conversation comments, which GitHub exposes through issue-comment APIs.                                                              |
| Actions         | Read and write | Read workflow runs, jobs, and logs; rerun workflows; and cancel actionable in-progress runs.                                                                         |
| Commit statuses | Read           | Read third-party commit status contexts included in the PR status rollup.                                                                                            |

If automatic workflow cancellation is disabled with `--no-auto-cancel-actionable` and no rerun or cancel command will be used, `Actions: Read` is sufficient. The default workflow needs `Actions: Read and write`.

The token owner must also have enough access to perform the requested operation in the repository. Organization approval, SAML SSO authorization, and repository-selection policies can restrict a token independently of its listed permissions.

Fine-grained PATs do not expose a separate **Checks** permission. Use **Actions** access for GitHub Actions check runs and logs, and **Commit statuses: Read** for status contexts. The fine-grained **Workflows** permission controls changes to workflow files; it does not grant access to workflow runs and is not required by pr-shepherd.

For a classic PAT, grant the `repo` scope for complete operation, including private repositories.

GitHub references:

- [Managing fine-grained personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Fine-grained PAT permissions](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)
- [Workflow runs API permissions](https://docs.github.com/en/rest/actions/workflow-runs)
- [Commit statuses API permissions](https://docs.github.com/en/rest/commits/statuses)

## Permission failures

Missing access commonly appears as a `403 Resource not accessible by personal access token` GraphQL error. pr-shepherd treats GraphQL read errors as fatal because partial PR, review, or check data could otherwise produce an unsafe state transition. `iterate` and `poll` exit non-zero instead of emitting `wait`, `retry`, or another action from an incomplete snapshot.

Check the error's GraphQL path to identify the affected field, update the token permission or repository selection, and retry. Use `pr-shepherd log-file` to locate the request log when more context is needed.

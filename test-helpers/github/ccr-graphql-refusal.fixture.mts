/**
 * HTTP 403 body the Claude Code cloud proxy returns for `POST /graphql`. Reconstructed from a real
 * cloud run of jonathanong/pr-shepherd (issue #529): the refusal sentence and the advertised `ccr`
 * routes are as observed; the exact wording of the route list is not a verbatim capture. The list
 * is long enough that the generic error message, truncated to 200 characters, hides most of it.
 */
export const CCR_GRAPHQL_REFUSAL_BODY = JSON.stringify({
  message:
    "GitHub GraphQL is not available from Claude Code sessions; use the REST API instead. " +
    "Pull request operations that GraphQL would provide are available as REST routes: " +
    "GET /repos/{owner}/{repo}/pulls/{pull_number}/ccr/review_threads, " +
    "POST /repos/{owner}/{repo}/pulls/{pull_number}/ccr/comments/{comment_id}/resolve, " +
    "POST /repos/{owner}/{repo}/pulls/{pull_number}/ccr/comments/{comment_id}/unresolve, " +
    "POST /repos/{owner}/{repo}/pulls/{pull_number}/ccr/ready_for_review, " +
    "POST /repos/{owner}/{repo}/pulls/{pull_number}/ccr/convert_to_draft, " +
    "PUT /repos/{owner}/{repo}/pulls/{pull_number}/ccr/auto_merge, " +
    "DELETE /repos/{owner}/{repo}/pulls/{pull_number}/ccr/auto_merge",
});

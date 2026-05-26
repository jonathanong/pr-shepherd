export function warnPrrcThreadIds(ids: string[]): string[] {
  const prrcIds = ids.filter((id) => id.startsWith("PRRC_"));
  if (prrcIds.length > 0) {
    process.stderr.write(
      `pr-shepherd: resolve: warning: --resolve-thread-ids contains comment IDs (PRRC_*) instead of thread IDs (PRRT_*): ${prrcIds.join(", ")}. The resolveReviewThread mutation requires PRRT_* thread IDs. Run a GraphQL query for pullRequest.reviewThreads to get the correct IDs.\n`,
    );
  }
  return prrcIds;
}

export function validateRequireSha(sha: string | undefined): boolean {
  if (sha === undefined) return true;
  if (/^[0-9a-f]{40}$/.test(sha)) return true;
  process.stderr.write(
    `pr-shepherd: resolve: --require-sha must be a full 40-character lowercase hex SHA, got "${sha}". Short SHAs will never match GitHub's headRefOid. Use $(git rev-parse HEAD) to get the full SHA.\n`,
  );
  process.exitCode = 1;
  return false;
}

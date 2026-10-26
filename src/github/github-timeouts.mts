/**
 * Deadline for one GitHub REST or GraphQL request, headers and body included.
 * Without it a half-open connection waits for undici's 300s headers/body
 * defaults (10s for connect) and the tick prints nothing meanwhile.
 */
export const GITHUB_API_TIMEOUT_MS = 60_000;

/** Deadline for Actions log downloads, which can be several megabytes. */
export const GITHUB_LOG_TIMEOUT_MS = 180_000;

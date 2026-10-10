import { GitHubRequestError } from "./errors.mts";

/** A cloud proxy refusal says nothing about the viewer's GitHub authorization. */
export function isRestSessionRefusal(error: unknown): error is GitHubRequestError {
  return (
    error instanceof GitHubRequestError &&
    isRestSessionRefusalResponse(error.status, error.responseMessage ?? error.message)
  );
}

/** Inspect the response before normal error-message truncation hides its evidence. */
export function isRestSessionRefusalResponse(status: number, raw: string): boolean {
  if (status !== 403) return false;
  if (/not enabled for this session|sessions are bound/i.test(raw)) return true;
  try {
    const payload = JSON.parse(raw) as { documentation_url?: unknown } | null;
    return (
      typeof payload?.documentation_url === "string" &&
      new URL(payload.documentation_url).hostname === "docs.anthropic.com"
    );
  } catch {
    return false;
  }
}

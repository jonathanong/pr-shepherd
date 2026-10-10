import { readRest } from "./rest-reader-core.mts";
import { GitHubRequestError } from "./errors.mts";
import { rateLimitKind } from "./rate-limit-kind.mts";
import { isRestSessionRefusal } from "./rest-session-refusal.mts";

/** Installation tokens may read PRs without supporting authenticated-user identity. */
export async function readRestViewerLogin(): Promise<string | null> {
  try {
    const viewer = await readRest<unknown>("GET", "/user");
    if (!viewer || typeof viewer !== "object" || Array.isArray(viewer)) return null;
    const login = (viewer as Record<string, unknown>).login;
    return typeof login === "string" && login.length > 0 ? login : null;
  } catch (error) {
    if (
      error instanceof GitHubRequestError &&
      [401, 403, 404].includes(error.status) &&
      rateLimitKind(error) === null &&
      !isRestSessionRefusal(error)
    )
      return null;
    throw error;
  }
}

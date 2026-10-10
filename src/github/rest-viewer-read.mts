import { readRest } from "./rest-reader-core.mts";
import { GitHubRequestError } from "./errors.mts";
import { rateLimitKind } from "./rate-limit-kind.mts";
import { isRestSessionRefusal } from "./rest-session-refusal.mts";
import { currentRestConditionalKey } from "./rest-conditional-scope.mts";
import { makeAuthHeaders } from "./http-auth.mts";
import { loadDerived, storeDerived } from "../state/rest-cache.mts";

/**
 * GitHub never answers an error status with 304, so a token that cannot read `/user` would be
 * charged for the same denial on every poll tick. The denial is remembered per credential for
 * an hour; a token change, or the hour passing, asks GitHub again.
 */
const UNAVAILABLE_TTL_MS = 60 * 60 * 1000;

/** Installation tokens may read PRs without supporting authenticated-user identity. */
export async function readRestViewerLogin(): Promise<string | null> {
  const key = currentRestConditionalKey();
  const name = key && `viewer-unavailable:${(await makeAuthHeaders()).fingerprint}`;
  if (key && name) {
    const denied = await loadDerived<true>(key, name);
    if (denied && Date.now() - denied.storedAt < UNAVAILABLE_TTL_MS) return null;
  }
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
    ) {
      if (key && name) await storeDerived(key, name, true);
      return null;
    }
    throw error;
  }
}

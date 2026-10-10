import type { CheckAnnotation } from "../types.mts";
import {
  readRestPages,
  restRepoPath,
  restString,
  restNumber,
  restCollection,
  restObject,
} from "./rest-reader-core.mts";
import { recordRestIdentity, resolveRestIdentity } from "./rest-identities.mts";
import { toCheckAnnotation } from "./check-annotation-shape.mts";
import type { AnnotationCacheOptions } from "./check-annotation-cache.mts";
import { readRestPull } from "./rest-pr-core.mts";

/** An annotation fallback can follow a GraphQL snapshot with no persisted REST check IDs. */
export async function ensureRestCheckIdentities(
  checkRunIds: string[],
  scope?: AnnotationCacheOptions,
): Promise<void> {
  if (!scope || checkRunIds.length === 0) return;
  const identities = await Promise.allSettled(
    checkRunIds.map((id) => resolveRestIdentity(id, "check")),
  );
  if (identities.every((identity) => identity.status === "fulfilled")) return;
  const repo = { owner: scope.stateKey.owner, name: scope.stateKey.repo };
  const pr = scope.stateKey.pr;
  const sha = scope.headSha ?? (await readRestPull(pr, repo)).head.sha;
  const checks = await readRestPages<Record<string, unknown>>(
    `${restRepoPath(repo)}/commits/${encodeURIComponent(sha)}/check-runs?filter=all`,
    (body) => restCollection(body, "check_runs") as Record<string, unknown>[],
  );
  await Promise.all(
    checks.nodes.map((value) => {
      const check = restObject(value, "check run identity");
      return recordRestIdentity(
        repo,
        pr,
        restString(check.node_id, "check node_id"),
        restNumber(check.id, "check id"),
        "check",
      );
    }),
  );
}

export async function readRestCheckAnnotations(
  checkRunId: string,
  scope?: AnnotationCacheOptions,
): Promise<CheckAnnotation[]> {
  await ensureRestCheckIdentities([checkRunId], scope);
  const identity = await resolveRestIdentity(checkRunId, "check");
  const result = await readRestPages<Record<string, unknown>>(
    `${restRepoPath(identity.repo)}/check-runs/${identity.numericId}/annotations`,
  );
  return result.nodes.map((raw) =>
    toCheckAnnotation(checkRunId, {
      fullDatabaseId: null,
      path: restString(raw.path, "annotation path"),
      annotationLevel: restString(raw.annotation_level, "annotation level").toUpperCase(),
      title: typeof raw.title === "string" ? raw.title : null,
      message: restString(raw.message, "annotation message"),
      rawDetails: typeof raw.raw_details === "string" ? raw.raw_details : null,
      blobUrl: typeof raw.blob_href === "string" ? raw.blob_href : null,
      location: {
        start: {
          line: restNumber(raw.start_line, "annotation start_line"),
          column: typeof raw.start_column === "number" ? raw.start_column : null,
        },
        end: {
          line: restNumber(raw.end_line, "annotation end_line"),
          column: typeof raw.end_column === "number" ? raw.end_column : null,
        },
      },
    }),
  );
}

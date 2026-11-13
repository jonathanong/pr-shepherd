import { pollRateLimitRetryAfterMs } from "../poll-quota.mts";
import type { ConflictCandidateFiles } from "../../types.mts";
import { readRestFilesChangedOnBothSides } from "../../github/rest-conflict-files-read.mts";

/** Lean-output cap on listed paths; `total` keeps the full count. */
const CONFLICT_CANDIDATE_FILES_CAP = 25;

export interface ConflictCandidateFilesInput {
  owner: string;
  repo: string;
  baseRefName: string;
  headRefOid: string;
}

/** Bounded best-effort lookup; failures leave the ordinary conflict step, rate limits propagate. */
export async function lookupConflictCandidateFiles(
  input: ConflictCandidateFilesInput,
): Promise<ConflictCandidateFiles | undefined> {
  try {
    const files = await readRestFilesChangedOnBothSides(
      { owner: input.owner, name: input.repo },
      input.baseRefName,
      input.headRefOid,
    );
    if (files.length === 0) return undefined;
    return { files: files.slice(0, CONFLICT_CANDIDATE_FILES_CAP), total: files.length };
  } catch (error) {
    if (pollRateLimitRetryAfterMs(error) !== null) throw error;
    process.stderr.write(
      `pr-shepherd: conflict candidate files unavailable (ignored): ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return undefined;
  }
}

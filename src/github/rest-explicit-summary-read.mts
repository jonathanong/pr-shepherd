import type { RepoInfo } from "./client.mts";
import { fetchRestRawSummaryPr } from "./rest-batch-read.mts";
import { readRestViewerLogin } from "./rest-viewer-read.mts";
import { mapPool } from "../util/pool.mts";

/** One principal read for this explicit PR chunk, without assuming its PRs are standalone. */
export async function readRestExplicitSummary(prs: number[], repo: RepoInfo) {
  const viewerLogin = await readRestViewerLogin();
  return mapPool(prs, 4, (pr) => fetchRestRawSummaryPr(pr, repo, undefined, viewerLogin));
}

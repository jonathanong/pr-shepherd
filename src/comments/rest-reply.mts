import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePrStatePath } from "../state/base.mts";
import { rest, restWithRateLimit } from "../github/http.mts";
import type { RateLimitInfo } from "../github/http-utils.mts";
import type { RepoInfo } from "../github/client.mts";
import { GitHubRequestError } from "../github/errors.mts";
import { isTransportError } from "../github/http-utils.mts";
import { readRestPages, restRepoPath } from "../github/rest-reader-core.mts";
interface ReplyComment {
  id: number;
  body: string;
  in_reply_to_id?: number;
  user: { login: string } | null;
}
interface PendingReply {
  root: string;
  body: string;
  viewer?: string;
  beforeIds: number[];
}
interface ReplyResult {
  id: string;
  rateLimit?: RateLimitInfo;
}

export function isAmbiguousMutationError(error: unknown): boolean {
  return isTransportError(error) || (error instanceof GitHubRequestError && error.status >= 500);
}

function replyPath(repo: RepoInfo, pr: number, root: string, body: string): string {
  const hash = createHash("sha256").update(`${root}\n${body}`).digest("hex");
  return resolvePrStatePath(
    { owner: repo.owner, repo: repo.name, pr },
    "pending-replies",
    `${hash}.json`,
  );
}

async function readComments(repo: RepoInfo, pr: number) {
  return readRestPages<ReplyComment>(`${restRepoPath(repo)}/pulls/${pr}/comments`);
}

async function findPendingReply(
  repo: RepoInfo,
  pr: number,
  pending: PendingReply,
): Promise<ReplyResult | undefined> {
  if (!pending.viewer) return undefined;
  const existing = new Set(pending.beforeIds);
  const response = await readComments(repo, pr);
  const matches = response.nodes.filter(
    (comment) =>
      String(comment.in_reply_to_id) === pending.root &&
      comment.body === pending.body &&
      comment.user?.login === pending.viewer &&
      !existing.has(comment.id),
  );
  return matches.length === 1
    ? { id: String(matches[0]!.id), rateLimit: response.rateLimit }
    : undefined;
}

export async function replyToThread(
  repo: RepoInfo,
  pr: number,
  root: string,
  body: string,
): Promise<ReplyResult> {
  const path = replyPath(repo, pr, root, body);
  let pending: PendingReply | undefined;
  try {
    pending = JSON.parse(await readFile(path, "utf8")) as PendingReply;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error("Cannot read pending REST reply; cannot safely retry", { cause: error });
  }
  if (pending) {
    if (pending.root !== root || pending.body !== body || !Array.isArray(pending.beforeIds))
      throw new Error("Invalid pending REST reply; cannot safely retry");
    const id = await findPendingReply(repo, pr, pending);
    if (!id)
      throw new Error(
        "Previous reply outcome is uncertain; refresh the thread before retrying, no duplicate reply was sent",
      );
    await unlink(path);
    return id;
  }
  // These reads provide the exact author and pre-write IDs needed after a lost response.
  let viewer: string | undefined;
  try {
    viewer = (await rest<{ login?: string }>("GET", "/user")).login;
  } catch (error) {
    if (!(error instanceof GitHubRequestError) || ![403, 404].includes(error.status)) throw error;
  }
  const comments = await readComments(repo, pr);
  pending = {
    root,
    body,
    ...(viewer && { viewer }),
    beforeIds: comments.nodes.map((comment) => comment.id),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(pending), { flag: "wx" });
  try {
    const result = await restWithRateLimit<{ id?: number }>(
      "POST",
      `${restRepoPath(repo)}/pulls/${pr}/comments/${root}/replies`,
      { body },
    );
    if (!Number.isSafeInteger(result.data?.id) || result.data.id! <= 0)
      throw new Error("Reply returned no valid comment ID; outcome is uncertain");
    await unlink(path);
    return { id: String(result.data.id), rateLimit: result.rateLimit };
  } catch (error) {
    if (isAmbiguousMutationError(error)) {
      try {
        const id = await findPendingReply(repo, pr, pending);
        if (id) {
          await unlink(path);
          return id;
        }
      } catch {}
    } else if (error instanceof GitHubRequestError && error.status >= 400 && error.status < 500) {
      await unlink(path);
    }
    throw error;
  }
}

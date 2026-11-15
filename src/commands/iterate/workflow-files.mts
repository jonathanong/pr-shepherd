import { graphql } from "../../github/client.mts";
import type { RepoInfo } from "../../github/client.mts";
import { GitHubRequestError } from "../../github/errors.mts";
import { githubOperation, isGithubReadFallbackError } from "../../github/transport.mts";
import { readRest, restObject, restRepoPath } from "../../github/rest-reader-core.mts";
import { pollRateLimitRetryAfterMs } from "../poll-quota.mts";

/** A workflow file at a ref: a commit SHA, or a branch name whose live tip is wanted. */
export interface WorkflowFileRequest {
  ref: string;
  path: string;
  /** True when `ref` is a commit SHA, so the answer can be remembered for the process. */
  pinned: boolean;
}

/** The file's text, or why it could not be read. */
export type WorkflowFileResult = { text: string } | { unreadable: string };

const memo = new Map<string, WorkflowFileResult>();

/** Forget remembered files. */
export function clearWorkflowFileMemo(): void {
  memo.clear();
}

/** Lookup key for a request in the result map. */
export const workflowFileKey = (request: { ref: string; path: string }): string =>
  `${request.ref}:${request.path}`;

const memoKey = (repo: RepoInfo, request: WorkflowFileRequest): string =>
  `${repo.owner}/${repo.name}\0${workflowFileKey(request)}`;

interface BlobAnswer {
  text?: string | null;
  isTruncated?: boolean;
}

function fromBlob(blob: BlobAnswer | null | undefined): WorkflowFileResult {
  if (blob == null || typeof blob.text !== "string") return { unreadable: "404" };
  return blob.isTruncated ? { unreadable: "truncated" } : { text: blob.text };
}

async function readGraphql(
  repo: RepoInfo,
  requests: readonly WorkflowFileRequest[],
): Promise<WorkflowFileResult[]> {
  const declarations = requests.map((_, i) => `, $e${i}: String!`).join("");
  const fields = requests
    .map((_, i) => `w${i}: object(expression: $e${i}) { ... on Blob { text isTruncated } }`)
    .join(" ");
  const query = `query WorkflowFiles($owner: String!, $name: String!${declarations}) { repository(owner: $owner, name: $name) { ${fields} } }`;
  const variables: Record<string, string> = { owner: repo.owner, name: repo.name };
  requests.forEach((request, i) => {
    variables[`e${i}`] = workflowFileKey(request);
  });
  const { data } = await graphql<{ repository: Record<string, BlobAnswer | null> | null }>(
    query,
    variables,
  );
  return requests.map((_, i) => fromBlob(data.repository?.[`w${i}`]));
}

async function readOneRest(
  repo: RepoInfo,
  request: WorkflowFileRequest,
): Promise<WorkflowFileResult> {
  const path = request.path.split("/").map(encodeURIComponent).join("/");
  try {
    const body = restObject(
      await readRest<unknown>(
        "GET",
        `${restRepoPath(repo)}/contents/${path}?ref=${encodeURIComponent(request.ref)}`,
      ),
      "workflow file",
    );
    if (body["encoding"] !== "base64" || typeof body["content"] !== "string") {
      return { unreadable: "truncated" };
    }
    return { text: Buffer.from(body["content"], "base64").toString("utf8") };
  } catch (error) {
    if (pollRateLimitRetryAfterMs(error) !== null) throw error;
    return {
      unreadable: error instanceof GitHubRequestError ? String(error.status) : "request failed",
    };
  }
}

/**
 * One aliased GraphQL read (or one REST `contents` read per file) of the requested workflow
 * files, best-effort: a failure marks the file unreadable, a rate limit propagates. Files read
 * at a commit SHA are remembered for the process, so a `--until-terminal` loop reads each once.
 */
export async function readWorkflowFiles(
  repo: RepoInfo,
  requests: readonly WorkflowFileRequest[],
): Promise<Map<string, WorkflowFileResult>> {
  const results = new Map<string, WorkflowFileResult>();
  const pending = new Map<string, WorkflowFileRequest>();
  for (const request of requests) {
    const known = request.pinned ? memo.get(memoKey(repo, request)) : undefined;
    if (known) results.set(workflowFileKey(request), known);
    else pending.set(workflowFileKey(request), request);
  }
  if (pending.size === 0) return results;
  const wanted = [...pending.values()];
  let answers: WorkflowFileResult[];
  try {
    answers = await githubOperation(
      "WorkflowFiles",
      () => readGraphql(repo, wanted),
      () => Promise.all(wanted.map((request) => readOneRest(repo, request))),
    );
  } catch (error) {
    if (pollRateLimitRetryAfterMs(error) !== null || isGithubReadFallbackError(error)) throw error;
    process.stderr.write(
      `pr-shepherd: workflow files unavailable (ignored): ${error instanceof Error ? error.message : String(error)}\n`,
    );
    answers = wanted.map(() => ({ unreadable: "request failed" }));
  }
  wanted.forEach((request, i) => {
    const answer = answers[i]!;
    results.set(workflowFileKey(request), answer);
    if (request.pinned && ("text" in answer || answer.unreadable === "404")) {
      memo.set(memoKey(repo, request), answer);
    }
  });
  return results;
}

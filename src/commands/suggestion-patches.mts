import { getRepoInfo, getCurrentPrNumber, getCurrentBranch } from "../github/client.mts";
import { fetchSuggestionThreads } from "../github/suggestion-thread.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { BuildSuggestionPatchesResult, GlobalOptions } from "../types.mts";
import {
  buildCommitCommand,
  buildSuggestionPatchItem,
  quotePath,
  validateSuggestionThread,
  type SuggestionPatchRequest,
} from "./suggestion-patch-item.mts";
import {
  checkPatchesApply,
  getLocalHeadSha,
  getPathsStatus,
  isAncestor,
  readPrHeadFile,
} from "./suggestion-patch-git.mts";

export interface SuggestionPatchesOptions extends GlobalOptions {
  suggestions: readonly SuggestionPatchRequest[];
}

export async function runSuggestionPatches(
  opts: SuggestionPatchesOptions,
): Promise<BuildSuggestionPatchesResult> {
  validateRequests(opts.suggestions);
  const repo = await getRepoInfo();
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new ShepherdError(
      "No open PR found for current branch. Pass a PR number explicitly.",
      EXIT.UNAVAILABLE,
    );
  }

  const [currentBranch, localHeadSha, data] = await Promise.all([
    getCurrentBranch(),
    getLocalHeadSha(),
    fetchSuggestionThreads(
      prNumber,
      repo,
      opts.suggestions.map((suggestion) => suggestion.threadId),
    ),
  ]);
  await validateHead({ currentBranch, localHeadSha, prNumber, data });

  const threads = data.threads.map((thread, index) =>
    validateSuggestionThread(thread, opts.suggestions[index]!),
  );
  const paths = [...new Set(threads.map((thread) => thread.path!))];
  const status = await getPathsStatus(paths);
  if (status !== "") {
    throw new ShepherdError(
      `Suggestion target files have uncommitted changes:\n${status}\n` +
        "Commit or stash them before running build-suggestion-patches.",
      EXIT.UNAVAILABLE,
    );
  }

  const originals = await readOriginals(data.headRefOid, paths);
  const patches = threads.map((thread, index) =>
    buildSuggestionPatchItem({
      thread,
      request: opts.suggestions[index]!,
      originalContent: originals.get(thread.path!)!,
    }),
  );
  try {
    await checkPatchesApply(patches.map((patch) => patch.patch));
  } catch (error) {
    throw new ShepherdError(
      `Ordered suggestion patches built from PR head ${data.headRefOid} do not apply to ` +
        `local HEAD ${localHeadSha}: ${errorMessage(error)} No patches were returned; inspect the ` +
        "current source and reviewer intent.",
      EXIT.UNAVAILABLE,
    );
  }

  return {
    pr: prNumber,
    repo: `${repo.owner}/${repo.name}`,
    patches,
    postActionInstructions: buildBatchInstructions(patches),
  };
}

function validateRequests(requests: readonly SuggestionPatchRequest[]): void {
  if (requests.length === 0) usage("At least one suggestion is required.");
  const seen = new Set<string>();
  for (const request of requests) {
    if (!request.threadId || request.threadId.trim() === "") usage("Each --thread-id is required.");
    if (!request.message || request.message.trim() === "") {
      usage(`--message is required and must be non-empty for thread ${request.threadId}.`);
    }
    if (seen.has(request.threadId)) usage(`Duplicate thread ID: ${request.threadId}.`);
    seen.add(request.threadId);
  }
}

async function validateHead({
  currentBranch,
  localHeadSha,
  prNumber,
  data,
}: {
  currentBranch: string;
  localHeadSha: string;
  prNumber: number;
  data: Awaited<ReturnType<typeof fetchSuggestionThreads>>;
}): Promise<void> {
  if (!data.headRepoWithOwner) {
    throw new ShepherdError(
      `PR #${prNumber} head repository is unavailable (fork may have been deleted).`,
      EXIT.UNAVAILABLE,
    );
  }
  if (currentBranch !== data.headRefName) {
    throw new ShepherdError(
      `Current branch "${currentBranch}" does not match PR head branch "${data.headRefName}". ` +
        `Check out "${data.headRefName}" before applying suggestions.`,
      EXIT.UNAVAILABLE,
    );
  }
  if (localHeadSha === data.headRefOid) return;
  await ensureDescendant(data.headRefOid, localHeadSha, data.headRefName);
}

async function ensureDescendant(
  prHeadSha: string,
  localHeadSha: string,
  branch: string,
): Promise<void> {
  if (await isAncestor(prHeadSha, localHeadSha)) return;
  throw new ShepherdError(
    `Local HEAD ${localHeadSha} is not PR head ${prHeadSha} or its descendant. ` +
      `Pull/rebase "${branch}" to the latest PR head and try again.`,
    EXIT.UNAVAILABLE,
  );
}

async function readOriginals(
  headSha: string,
  paths: readonly string[],
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    paths.map(async (path) => {
      try {
        return [path, await readPrHeadFile(headSha, path)] as const;
      } catch (error) {
        throw new ShepherdError(
          `Could not read ${path} at PR head ${headSha}: ${errorMessage(error)}`,
          EXIT.UNAVAILABLE,
        );
      }
    }),
  );
  return new Map(entries);
}

function buildBatchInstructions(patches: BuildSuggestionPatchesResult["patches"]): string[] {
  const patchInstructions = patches.flatMap((patch, index) => [
    `Apply patch ${index + 1} to \`${patch.path}\` using \`git apply\`.`,
    `Stage patch ${index + 1}: \`git add -- ${quotePath(patch.path)}\``,
    `Commit patch ${index + 1}: \`${buildCommitCommand(patch)}\``,
  ]);
  return [
    ...patchInstructions,
    "Shepherd cannot verify authorization for the Git credential that would push this branch, so this output does not recommend a push.",
    `Continue only with authorization-checked \`apply review\` instructions from the originating iterate output for thread IDs: ${patches.map((patch) => patch.threadId).join(", ")}.`,
  ];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function usage(message: string): never {
  throw new ShepherdError(message, EXIT.USAGE);
}

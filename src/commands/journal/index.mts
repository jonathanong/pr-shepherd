import {
  getRepoInfo,
  getPullRequestBody,
  updatePullRequestBody,
  getCurrentPrNumber,
} from "../../github/client.mts";
import { validateJournalItem, appendJournalItem } from "./transform.mts";

export interface RunJournalOptions {
  prNumber: number | undefined;
  targetRepository?: { owner: string; name: string };
  rawItem: string;
  dryRun: boolean;
}

export interface JournalResult {
  prNumber: number;
  mutated: boolean;
  sectionExisted: boolean;
  dryRun: boolean;
  previewBody?: string;
  authorizationSkipped?: "denied-or-unverifiable";
}

/** @deprecated Hidden implementation for standalone `journal`; use `apply journal`. */
export async function runJournal(opts: RunJournalOptions): Promise<JournalResult> {
  const validation = validateJournalItem(opts.rawItem);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  const { item } = validation;

  const { owner, name } = opts.targetRepository ?? (await getRepoInfo());

  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (!prNumber) {
    throw new Error(
      "PR number is required: no PR number provided and none found for current branch",
    );
  }

  const { nodeId, body, viewerCanUpdate } = await getPullRequestBody(prNumber, owner, name);

  const { body: newBody, mutated, sectionExisted } = appendJournalItem(body, item);

  if (mutated && !opts.dryRun && viewerCanUpdate !== true) {
    return {
      prNumber,
      mutated: false,
      sectionExisted,
      dryRun: false,
      authorizationSkipped: "denied-or-unverifiable",
    };
  }

  if (mutated && !opts.dryRun) {
    await updatePullRequestBody(nodeId, newBody);
  }

  return {
    prNumber,
    mutated,
    sectionExisted,
    dryRun: opts.dryRun,
    ...(opts.dryRun ? { previewBody: newBody } : {}),
  };
}

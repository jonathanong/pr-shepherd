import { getRepoInfo, getPullRequestBody, updatePullRequestBody } from "../../github/client.mts";
import { validateJournalItem, appendJournalItem } from "./transform.mts";

export interface RunJournalOptions {
  prNumber: number | undefined;
  rawItem: string;
  dryRun: boolean;
}

export interface JournalResult {
  prNumber: number;
  mutated: boolean;
  sectionExisted: boolean;
  dryRun: boolean;
  previewBody?: string;
}

export async function runJournal(opts: RunJournalOptions): Promise<JournalResult> {
  const validation = validateJournalItem(opts.rawItem);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  const { item } = validation;

  const { owner, name } = await getRepoInfo();

  let prNumber = opts.prNumber;
  if (!prNumber) {
    throw new Error("PR number is required");
  }

  const { nodeId, body } = await getPullRequestBody(prNumber, owner, name);

  const { body: newBody, mutated, sectionExisted } = appendJournalItem(body, item);

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

import type { RelatedFailedJob } from "../types/check-classification.mts";

/** Shared text rendering of sibling failed jobs under a failing check bullet. */
export function renderRelatedJobLines(
  jobs: RelatedFailedJob[] | undefined,
  indent = "  ",
): string[] {
  if (!jobs || jobs.length === 0) return [];
  const lines = [`${indent}Other failed jobs in this run:`];
  for (const job of jobs) {
    lines.push(`${indent}- \`${job.name}\` [conclusion: ${job.conclusion}]`);
    if (job.failedStep) lines.push(`${indent}  > failed step: ${job.failedStep}`);
    if (job.logExcerpt) {
      for (const line of job.logExcerpt.split("\n")) lines.push(`${indent}  > ${line}`);
    }
  }
  return lines;
}

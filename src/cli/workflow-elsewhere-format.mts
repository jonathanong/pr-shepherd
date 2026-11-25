import type {
  AgentCheck,
  ElsewhereAnnotation,
  ElsewhereFailedJob,
  ElsewhereRun,
} from "../types.mts";

/** Format an ISO UTC timestamp as `HH:MMZ` for compact text output. */
function formatElsewhereShortTime(iso: string | undefined): string {
  if (!iso) return "unknown";
  const match = /T(\d{2}:\d{2}):\d{2}/.exec(iso);
  return match?.[1] ? `${match[1]}Z` : iso;
}

function sanitizeInline(value: string): string {
  return value.replace(/[`\r\n]+/g, " ").trim();
}

function formatAnnotation(ann: ElsewhereAnnotation): string {
  const path = sanitizeInline(ann.path);
  const loc = path ? `\`${ann.line !== null ? `${path}:${ann.line}` : path}\`` : "";
  const message = sanitizeInline(ann.message);
  if (loc && message) return `${loc} — ${message}`;
  return loc || message;
}

function renderFailedJob(job: ElsewhereFailedJob, runConclusion: string, indent: string): string[] {
  const name = sanitizeInline(job.name);
  const sameJob = job.sameJob ? " ← same job" : "";
  const showConclusion = job.annotations.length === 0 || job.conclusion !== runConclusion;
  const conclusionTag = showConclusion ? ` [conclusion: ${job.conclusion}]` : "";
  if (job.annotations.length === 0) {
    return [`${indent}- ${name}${conclusionTag}${sameJob}`];
  }
  if (job.annotations.length === 1) {
    return [
      `${indent}- ${name}${conclusionTag}${sameJob}: ${formatAnnotation(job.annotations[0]!)}`,
    ];
  }
  return [
    `${indent}- ${name}${conclusionTag}${sameJob}:`,
    ...job.annotations.map((ann) => `${indent}  - ${formatAnnotation(ann)}`),
  ];
}

function formatRunHeader(run: ElsewhereRun): string {
  const target =
    run.source === "default-branch"
      ? `\`${sanitizeInline(run.branch ?? "default branch")}\``
      : run.pr !== undefined
        ? `merge queue #${run.pr}`
        : "merge queue";
  return `${target} \`${run.headSha}\` run \`${run.runId}\` [conclusion: ${run.conclusion}]`;
}

/** Render the `Same workflow elsewhere` sub-lines for a failing merge-group Actions check. */
export function renderWorkflowElsewhereLines(check: AgentCheck, indent = "  "): string[] {
  if (check.elsewhereUnread !== undefined) {
    return [
      `${indent}Same workflow elsewhere: not read (${sanitizeInline(check.elsewhereUnread)})`,
    ];
  }
  if (check.elsewhere === undefined) return [];
  const since = formatElsewhereShortTime(check.elsewhereSince);
  if (check.elsewhere.length === 0) {
    return [`${indent}Same workflow elsewhere: no other runs since ${since}`];
  }
  const lines = [`${indent}Same workflow elsewhere (since ${since}, newest first):`];
  for (const run of check.elsewhere) {
    lines.push(`${indent}- ${formatRunHeader(run)}`);
    for (const job of run.failedJobs) {
      lines.push(...renderFailedJob(job, run.conclusion, `${indent}  `));
    }
  }
  return lines;
}

import type {
  AgentCheck,
  ElsewhereAnnotation,
  ElsewhereFailedJob,
  ElsewhereRun,
  ElsewhereScope,
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

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

function formatAnnotation(ann: ElsewhereAnnotation): string {
  const path = sanitizeInline(ann.path);
  const loc = path ? `\`${ann.line !== null ? `${path}:${ann.line}` : path}\`` : "";
  const message = sanitizeInline(ann.message);
  if (loc && message) return `${loc} — ${message}`;
  return loc || message;
}

function formatMoreAnnotations(count: number | undefined): string {
  if (!count || count <= 0) return "";
  return `(+${count} more ${count === 1 ? "annotation" : "annotations"})`;
}

function renderFailedJob(job: ElsewhereFailedJob, runConclusion: string, indent: string): string[] {
  const name = sanitizeInline(job.name);
  const sameJob = job.sameJob ? " ← same job" : "";
  const showConclusion = job.annotations.length === 0 || job.conclusion !== runConclusion;
  const conclusionTag = showConclusion ? ` [conclusion: ${job.conclusion}]` : "";
  const more = formatMoreAnnotations(job.moreAnnotations);
  if (job.annotations.length === 0) {
    return [`${indent}- ${name}${conclusionTag}${sameJob}${more ? ` ${more}` : ""}`];
  }
  if (job.annotations.length === 1) {
    return [
      `${indent}- ${name}${conclusionTag}${sameJob}: ${formatAnnotation(job.annotations[0]!)}${more ? ` ${more}` : ""}`,
    ];
  }
  const lines = [
    `${indent}- ${name}${conclusionTag}${sameJob}:`,
    ...job.annotations.map((ann) => `${indent}  - ${formatAnnotation(ann)}`),
  ];
  if (more) lines.push(`${indent}  - ${more}`);
  return lines;
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

function formatWorkflowLabel(scope: ElsewhereScope | undefined): string {
  const name = scope?.workflowName ? sanitizeInline(scope.workflowName) : "";
  const path = scope?.workflowPath ? sanitizeInline(scope.workflowPath) : "";
  if (name && path) return ` — \`${name}\` (${path})`;
  if (name) return ` — \`${name}\``;
  if (path) return ` — (${path})`;
  return "";
}

function formatCheckedLine(scope: ElsewhereScope, indent: string): string {
  const branch = `\`${sanitizeInline(scope.defaultBranch.branch)}\``;
  const defaultPart =
    scope.defaultBranch.commitsRead !== undefined
      ? `${branch} last ${plural(scope.defaultBranch.commitsRead, "commit", "commits")}`
      : `${branch} newest ${plural(scope.defaultBranch.runsRead ?? 0, "run", "runs")}`;
  const queuePart = `merge queue newest ${plural(scope.mergeQueue.runsRead, "run", "runs")}`;
  return `${indent}  checked: ${defaultPart} · ${queuePart}`;
}

function formatShowingLine(scope: ElsewhereScope, indent: string): string {
  const branch = `\`${sanitizeInline(scope.defaultBranch.branch)}\``;
  const { defaultBranch: def, mergeQueue: mq } = scope;
  return `${indent}  showing newest ${def.shown} of ${def.matched} on ${branch}, ${mq.shown} of ${mq.matched} in the merge queue`;
}

/** Render the `Same workflow elsewhere` sub-lines for a failing merge-group Actions check. */
export function renderWorkflowElsewhereLines(check: AgentCheck, indent = "  "): string[] {
  if (check.elsewhereUnread !== undefined) {
    return [
      `${indent}Same workflow elsewhere: not read (${sanitizeInline(check.elsewhereUnread)})`,
    ];
  }
  if (check.elsewhere === undefined) return [];
  const scope = check.elsewhereScope;
  const since = formatElsewhereShortTime(scope?.since);
  const wfLabel = formatWorkflowLabel(scope);
  if (check.elsewhere.length === 0) {
    const lines = [`${indent}Same workflow elsewhere${wfLabel}, since ${since}: none found`];
    if (scope) lines.push(formatCheckedLine(scope, indent));
    return lines;
  }
  const lines = [`${indent}Same workflow elsewhere${wfLabel}, since ${since}:`];
  if (scope) {
    lines.push(formatCheckedLine(scope, indent), formatShowingLine(scope, indent));
  }
  for (const run of check.elsewhere) {
    lines.push(`${indent}- ${formatRunHeader(run)}`);
    for (const job of run.failedJobs) {
      lines.push(...renderFailedJob(job, run.conclusion, `${indent}  `));
    }
  }
  return lines;
}

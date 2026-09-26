import type {
  AutoMinimizedItem,
  AutoResolvedThread,
  RuleAutoResolveReport,
  ShepherdReport,
} from "../types.mts";

export function uniqueReasons(reasons: readonly string[]): string[] {
  const unique: string[] = [];
  for (const reason of reasons) {
    const cleaned = reason.trim();
    if (cleaned && !unique.includes(cleaned)) unique.push(cleaned);
  }
  return unique;
}

export function reasonClause(reasons: readonly string[]): string | undefined {
  const unique = uniqueReasons(reasons);
  if (unique.length === 0) return undefined;
  const label = unique.length === 1 ? "rule" : "rules";
  return `(${label}: ${unique.join("; ")})`;
}

function joinedReason(reasons: readonly string[]): string | undefined {
  const unique = uniqueReasons(reasons);
  return unique.length > 0 ? unique.join("; ") : undefined;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function ruleAutoResolveBody(counts: {
  threads: number;
  comments: number;
  reviewSummaries: number;
}): string | undefined {
  const parts: string[] = [];
  if (counts.threads > 0) parts.push(`auto-resolved ${plural(counts.threads, "thread")}`);
  const minimized: string[] = [];
  if (counts.comments > 0) minimized.push(plural(counts.comments, "comment"));
  if (counts.reviewSummaries > 0) {
    minimized.push(plural(counts.reviewSummaries, "review summary", "review summaries"));
  }
  if (minimized.length > 0) parts.push(`minimized ${minimized.join(" and ")}`);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function withReasonClause(body: string, reasons: readonly string[]): string {
  const clause = reasonClause(reasons);
  return clause ? `${body} ${clause}` : body;
}

export function formatRuleAutoResolveJournalItem(input: {
  body: string;
  reasons: readonly string[];
  viewerLogin?: string;
  urls: readonly string[];
}): string {
  const login = input.viewerLogin?.trim();
  const actor = login ? `as @${login}` : "(token login unavailable)";
  const clause = reasonClause(input.reasons);
  const links = input.urls.map((url) => url.trim()).filter(Boolean);
  const reasonSuffix = clause ? ` ${clause}` : "";
  const linkSuffix = links.length > 0 ? `: ${links.join(", ")}` : "";
  return `- ${input.body} ${actor}${reasonSuffix}${linkSuffix}`;
}

export function decorateAutoResolveError(error: string, reasons: readonly string[]): string {
  const clause = reasonClause(reasons);
  return clause ? `${error} ${clause}` : error;
}

export function reasonsForError(
  error: string,
  ids: readonly string[],
  ruleReasons: ReadonlyMap<string, readonly string[]>,
): string[] {
  const id = ids.find((candidate) => error.startsWith(`${candidate}:`));
  if (id) return [...(ruleReasons.get(id) ?? [])];
  if (!error.startsWith("rate limit:")) return [];
  return uniqueReasons(ids.flatMap((candidate) => [...(ruleReasons.get(candidate) ?? [])]));
}

function splitJoined(reason: string | undefined): string[] {
  if (!reason) return [];
  return reason.split("; ").filter(Boolean);
}

function reasonsFromErrors(errors: readonly string[]): string[] {
  const reasons: string[] = [];
  for (const error of errors) {
    const match = error.match(/ \((rule|rules): ([^)]+)\)$/);
    if (!match?.[2]) continue;
    for (const reason of match[2].split("; ")) {
      if (reason && !reasons.includes(reason)) reasons.push(reason);
    }
  }
  return reasons;
}

export function ruleAutoResolveFromReport(
  report: ShepherdReport,
): RuleAutoResolveReport | undefined {
  const threads = report.threads.autoResolved;
  const minimized = report.comments.autoMinimized ?? [];
  const errors = report.threads.autoResolveErrors;
  if (threads.length === 0 && minimized.length === 0 && errors.length === 0) return undefined;
  const comments = minimized.filter((item) => item.kind === "pr-comment").length;
  const reviewSummaries = minimized.filter((item) => item.kind === "review-summary").length;
  const success = threads.length + minimized.length > 0;
  const reasons = success
    ? uniqueReasons([
        ...threads.flatMap((thread) => splitJoined(thread.ruleReason)),
        ...minimized.flatMap((item) => splitJoined(item.ruleReason)),
      ])
    : reasonsFromErrors(errors);
  const body =
    ruleAutoResolveBody({ threads: threads.length, comments, reviewSummaries }) ??
    `auto-resolve failed for ${plural(errors.length, "mutation")}`;
  return {
    summary: withReasonClause(body, reasons),
    ...(threads.length > 0 && { threads }),
    ...(minimized.length > 0 && { minimized }),
    ...(errors.length > 0 && { errors }),
  };
}

function formatRuleAutoResolveSection(event: RuleAutoResolveReport | undefined): string | null {
  if (!event) return null;
  const lines = ["## Classification auto-resolve", "", event.summary];
  const links = [
    ...(event.threads ?? []).map((thread) => thread.url.trim() || `\`${thread.id}\``),
    ...(event.minimized ?? []).map((item) => item.url?.trim() || `\`${item.id}\``),
  ];
  if (links.length > 0) lines.push("", ...links.map((link) => `- ${link}`));
  if ((event.errors?.length ?? 0) > 0) {
    lines.push("", ...(event.errors ?? []).map((error) => `- ${error}`));
  }
  return lines.join("\n");
}

export function projectRuleAutoResolve(event: RuleAutoResolveReport): Record<string, unknown> {
  return {
    summary: event.summary,
    ...((event.threads?.length ?? 0) > 0 && { threads: event.threads }),
    ...((event.minimized?.length ?? 0) > 0 && { minimized: event.minimized }),
    ...((event.errors?.length ?? 0) > 0 && { errors: event.errors }),
  };
}

export function insertRuleAutoResolveSection(
  text: string,
  event: RuleAutoResolveReport | undefined,
): string {
  const section = formatRuleAutoResolveSection(event);
  if (!section) return text;
  const index = text.lastIndexOf("## Instructions");
  if (index === -1) return `${text}\n\n${section}`;
  return `${text.slice(0, index)}${section}\n\n${text.slice(index)}`;
}

export function stripReplayedRuleAutoResolve(report: ShepherdReport): ShepherdReport {
  const hasEvent =
    report.threads.autoResolved.length > 0 ||
    report.threads.autoResolveErrors.length > 0 ||
    (report.comments.autoMinimized?.length ?? 0) > 0;
  if (!hasEvent) return report;
  const { autoMinimized: _autoMinimized, ...comments } = report.comments;
  return {
    ...report,
    threads: { ...report.threads, autoResolved: [], autoResolveErrors: [] },
    comments,
  };
}

export function minimizedItem(
  kind: AutoMinimizedItem["kind"],
  id: string,
  url: string | undefined,
  reasons: readonly string[],
): AutoMinimizedItem {
  const ruleReason = joinedReason(reasons);
  return {
    id,
    kind,
    ...(url?.trim() ? { url: url.trim() } : {}),
    ...(ruleReason ? { ruleReason } : {}),
  };
}

export function resolvedThread(
  thread: AutoResolvedThread,
  reasons: readonly string[],
): AutoResolvedThread {
  const ruleReason = joinedReason(reasons);
  return { ...thread, isResolved: true, ...(ruleReason ? { ruleReason } : {}) };
}

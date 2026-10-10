// Token estimator, cost model and baseline payload renderers for bench.mjs.
// See README.md for the method and its limits.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const TOKENS_DIR = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(TOKENS_DIR, "data");
export const REPO_ROOT = dirname(dirname(TOKENS_DIR));

/** GitHub MCP tools any scenario calls. record.mjs snapshots exactly these schemas. */
export const MCP_TOOLS_USED = [
  "pull_request_read",
  "get_job_logs",
  "add_reply_to_pull_request_comment",
  "resolve_review_thread",
  "update_pull_request",
  "list_pull_requests",
  "merge_pull_request",
];

// --- model ------------------------------------------------------------------

/**
 * Every knob the report depends on. Changing one changes REPORT.md, which CI
 * checks, so a tweak is always visible in review.
 */
export const MODEL = {
  // A uniform 3.5 chars/token for every arm. JSON packs more tokens per char
  // than Markdown, so a uniform ratio undercounts the JSON-heavy baselines:
  // the error runs against pr-shepherd, not for it.
  charsPerToken: 3.5,
  // Claude Code truncates Bash output past 30,000 characters and rejects MCP
  // results past 25,000 tokens. A baseline call never costs more than that.
  bashOutputCapChars: 30_000,
  mcpOutputCapTokens: 25_000,
  // Context already in the window when a tick starts: system prompt, tool
  // list and conversation so far. It is replayed, from cache, on every turn.
  baseContextTokens: 30_000,
  // Anthropic list-price ratios relative to one uncached input token.
  cacheReadMultiplier: 0.1,
  cacheWriteMultiplier: 1.25,
  outputMultiplier: 5,
};

export const tokens = (text) => Math.ceil(text.length / MODEL.charsPerToken);

// --- data -------------------------------------------------------------------

export const readData = (name) => readFileSync(join(DATA_DIR, name), "utf8");
export const readJson = (name) => JSON.parse(readData(name));

const SNAPSHOTS = join(REPO_ROOT, "test-cases", "snapshots");
const FIXTURES = join(REPO_ROOT, "test-cases", "fixtures");

/** Recorded pr-shepherd output for a test-cases fixture. */
export const snapshot = (name) =>
  readFileSync(join(SNAPSHOTS, name, "output.text.md"), "utf8").trimEnd();

// Mirrors DEFAULT_BATCH in test-helpers/test-cases/harness.mts: the fields a
// fixture leaves out take these values when its snapshot is generated.
const DEFAULT_BATCH = {
  repo: "owner/repo",
  number: 42,
  state: "OPEN",
  isDraft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  reviewDecision: "APPROVED",
  headRefOid: "abc123",
  headRefName: "feature",
  baseRefName: "main",
  reviewThreads: [],
  comments: [],
  changesRequestedReviews: [],
  reviewSummaries: [],
  checks: [],
};

/** A test-cases fixture's input.json. */
export const fixtureInput = (name) =>
  JSON.parse(readFileSync(join(FIXTURES, name, "input.json"), "utf8"));

/** The GitHub state a fixture's snapshot was generated from. */
export function fixtureState(name) {
  return { ...DEFAULT_BATCH, ...fixtureInput(name).batchData };
}

/**
 * Overlay real review history onto a fixture state. Every overlaid item was
 * handled in an earlier tick: threads are resolved, summaries and comments
 * were read. pr-shepherd's seen markers hide them, so its snapshot does not
 * change, but a baseline agent fetches them again on every tick.
 */
export function withHistory(state, history) {
  const ts = (iso) => Math.floor(Date.parse(iso) / 1000);
  return {
    ...state,
    prTitle: history.prTitle,
    prBody: history.prBody,
    reviewThreads: [
      ...state.reviewThreads,
      ...history.reviewThreads.map((t, i) => ({
        id: `PRRT_history_${i}`,
        isResolved: t.isResolved,
        isOutdated: t.isOutdated,
        path: t.path,
        line: t.line,
        comments: t.comments,
      })),
    ],
    comments: [
      ...state.comments,
      ...history.comments.map((c) => ({ ...c, id: `IC_${c.id}`, createdAtUnix: ts(c.createdAt) })),
    ],
    historyReviews: history.reviews,
  };
}

// --- shared shapes ----------------------------------------------------------

const ISO = (unix) => new Date((unix ?? 1715700000) * 1000).toISOString().replace(".000", "");
const ghStatus = (c) => (c.status === "COMPLETED" ? "COMPLETED" : c.status);
const CHECK_STARTED = "2026-10-02T05:08:20Z";
const CHECK_COMPLETED = "2026-10-02T05:09:30Z";

/**
 * The numeric REST ID of fixture thread `i`'s root comment. Fixture URLs carry
 * readable anchors (`#discussion_r45_bot`), so the baselines get numeric IDs
 * and matching URLs, the only form a REST reply accepts.
 */
export const fixtureCommentId = (i) => 1000 + i;

/** Normalize a fixture thread (one root comment) and a history thread (many). */
const threadComments = (t, i, state) =>
  t.comments ?? [
    {
      id: fixtureCommentId(i),
      author: t.author,
      body: t.body,
      url: `https://github.com/${state.repo}/pull/${state.number}#discussion_r${fixtureCommentId(i)}`,
      createdAt: ISO(t.createdAtUnix),
    },
  ];

/** All reviews a baseline sees: open changes-requested, summaries, history. */
function allReviews(state) {
  return [
    ...state.changesRequestedReviews.map((r) => ({ ...r, state: "CHANGES_REQUESTED" })),
    ...state.reviewSummaries.map((r) => ({ ...r, state: "COMMENTED" })),
    ...(state.historyReviews ?? []).map((r) => ({ ...r, id: `PRR_${r.id}` })),
  ];
}

const [workflowOf, jobOf] = [
  (c) => (c.name.includes(" / ") ? c.name.split(" / ")[0] : c.name),
  (c) => (c.name.includes(" / ") ? c.name.split(" / ").slice(1).join(" / ") : c.name),
];

// --- gh CLI arm ---------------------------------------------------------------
//
// A competent gh user: `--json` field selection instead of raw REST, one
// GraphQL query for threads (REST has no thread IDs or resolution state), and
// output that gh prints compact because a tool call is not a TTY.

const GH_VIEW_FIELDS =
  "state,isDraft,mergeable,mergeStateStatus,reviewDecision,headRefOid,baseRefName,statusCheckRollup,reviews,comments";

export const ghViewCmd = (state) =>
  `gh pr view ${state.number} -R ${state.repo} --json ${GH_VIEW_FIELDS}`;

export function ghPrView(state) {
  return JSON.stringify({
    baseRefName: state.baseRefName,
    comments: state.comments.map((c) => ({
      id: c.id,
      author: { login: c.author },
      authorAssociation: c.authorType === "Bot" ? "NONE" : "MEMBER",
      body: c.body,
      createdAt: ISO(c.createdAtUnix),
      includesCreatedEdit: false,
      isMinimized: c.isMinimized ?? false,
      minimizedReason: "",
      reactionGroups: [],
      url: c.url,
      viewerDidAuthor: false,
    })),
    headRefOid: state.headRefOid,
    isDraft: state.isDraft,
    mergeStateStatus: state.mergeStateStatus,
    mergeable: state.mergeable,
    reviewDecision: state.reviewDecision,
    reviews: allReviews(state).map((r) => ({
      id: r.id,
      author: { login: r.author },
      authorAssociation: "NONE",
      body: r.body,
      submittedAt: r.submittedAt ?? ISO(),
      includesCreatedEdit: false,
      reactionGroups: [],
      state: r.state,
      commit: { oid: r.commit ?? state.headRefOid },
    })),
    state: state.state,
    statusCheckRollup: state.checks.map((c) => ({
      __typename: "CheckRun",
      completedAt: c.status === "COMPLETED" ? CHECK_COMPLETED : "0001-01-01T00:00:00Z",
      conclusion: c.conclusion ?? "",
      detailsUrl: c.detailsUrl,
      name: jobOf(c),
      startedAt: CHECK_STARTED,
      status: ghStatus(c),
      workflowName: workflowOf(c),
    })),
  });
}

// `gh pr view --json` has no merge-queue field, so the thread query asks for it.
export const ghThreadsCmd = (state) => {
  const [owner, name] = state.repo.split("/");
  return `gh api graphql -f query='query { repository(owner: "${owner}", name: "${name}") { pullRequest(number: ${state.number}) { mergeQueueEntry { position state } reviewThreads(first: 100) { nodes { id isResolved isOutdated path line comments(first: 50) { nodes { databaseId author { login } body url } } } } } } }'`;
};

export function ghThreads(state) {
  return JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          mergeQueueEntry: state.mergeQueueEntry
            ? { position: state.mergeQueueEntry.position, state: state.mergeQueueEntry.state }
            : null,
          reviewThreads: {
            nodes: state.reviewThreads.map((t, i) => ({
              id: t.id,
              isResolved: t.isResolved,
              isOutdated: t.isOutdated,
              path: t.path,
              line: t.line ?? null,
              comments: {
                nodes: threadComments(t, i, state).map((c) => ({
                  databaseId: c.id,
                  author: { login: c.author },
                  body: c.body,
                  url: c.url,
                })),
              },
            })),
          },
        },
      },
    },
  });
}

/** `gh pr checks` without a TTY: name, state, elapsed, URL, description. */
export function ghPrChecks(state) {
  const bucket = (c) =>
    c.status !== "COMPLETED" ? "pending" : c.conclusion === "SUCCESS" ? "pass" : "fail";
  return `${state.checks
    .map((c) =>
      [c.name, bucket(c), c.status === "COMPLETED" ? "1m10s" : "0", c.detailsUrl, ""].join("\t"),
    )
    .join("\n")}\n`;
}

/**
 * `gh run view --log-failed` prefixes every line of every failed step with the
 * job and step name, tab-separated.
 */
export function ghLogFailed(log, jobName, stepName, stepStartPattern, stepEndPattern) {
  const lines = log.split(/\r?\n/);
  const start = lines.findIndex((l) => stepStartPattern.test(l));
  if (start < 0) throw new Error(`step start not found: ${stepStartPattern}`);
  const end = lines.findIndex((l, i) => i > start && stepEndPattern.test(l));
  return lines
    .slice(start, end < 0 ? undefined : end)
    .map((l) => `${jobName}\t${stepName}\t${l}`)
    .join("\n");
}

export const tail = (text, n) => text.split("\n").slice(-n).join("\n");

/**
 * `gh api …/commits/<sha>/check-runs --jq` narrowed to failing runs: the only
 * way to find the check-run IDs whose annotations to fetch.
 */
export function ghFailingCheckRuns(state, annotationsByCheck) {
  return state.checks
    .filter((c) => c.conclusion === "FAILURE")
    .map((c, i) =>
      JSON.stringify({
        id: 30000000000 + i,
        name: c.name,
        output: {
          title: c.name,
          summary: `${(annotationsByCheck[c.id] ?? []).length} annotations`,
          annotations_count: (annotationsByCheck[c.id] ?? []).length,
        },
      }),
    )
    .join("\n");
}

/** REST `GET /check-runs/<id>/annotations`, compact. */
export const ghAnnotations = (annotations) =>
  JSON.stringify(
    annotations.map((a) => ({
      path: a.path,
      blob_href: a.blobUrl,
      start_line: a.startLine,
      start_column: a.startColumn ?? null,
      end_line: a.endLine,
      end_column: a.endColumn ?? null,
      annotation_level: a.level.toLowerCase(),
      title: a.title ?? "",
      message: a.message,
      raw_details: a.rawDetails ?? "",
    })),
  );

// --- GitHub MCP arm -----------------------------------------------------------
//
// Shapes copied from real github-mcp-server responses (pull_request_read
// methods get, get_check_runs, get_review_comments, get_reviews and
// get_comments, recorded against jonathanong/pr-shepherd#509).

const mcpUser = (login) => ({
  login,
  id: 643505,
  profile_url: `https://github.com/${login}`,
  avatar_url: "https://avatars.githubusercontent.com/u/643505?v=4",
});

export function mcpGet(state) {
  const merged = state.state === "MERGED";
  return JSON.stringify({
    number: state.number,
    title: state.prTitle ?? "Fixture PR",
    body: state.prBody ?? "",
    state: state.state === "OPEN" ? "open" : "closed",
    draft: state.isDraft,
    merged,
    mergeable_state: state.mergeStateStatus.toLowerCase(),
    html_url: `https://github.com/${state.repo}/pull/${state.number}`,
    user: mcpUser("author"),
    labels: [],
    head: {
      ref: state.headRefName,
      sha: state.headRefOid,
      repo: { full_name: state.repo, description: "Example repository" },
    },
    base: {
      ref: state.baseRefName,
      sha: "base123",
      repo: { full_name: state.repo, description: "Example repository" },
    },
    additions: 120,
    deletions: 30,
    changed_files: 6,
    commits: 3,
    comments: state.comments.length,
    created_at: "2026-10-09T23:35:01Z",
    updated_at: "2026-10-09T23:51:23Z",
  });
}

export function mcpCheckRuns(state) {
  return JSON.stringify({
    total_count: state.checks.length,
    check_runs: state.checks.map((c, i) => ({
      id: 114074470648 + i,
      name: c.name,
      status: c.status.toLowerCase(),
      ...(c.conclusion && { conclusion: c.conclusion.toLowerCase() }),
      html_url: `https://github.com/owner/repo/runs/${114074470648 + i}`,
      details_url: c.detailsUrl,
      started_at: CHECK_STARTED,
      ...(c.status === "COMPLETED" && { completed_at: CHECK_COMPLETED }),
    })),
  });
}

export function mcpReviewThreads(state) {
  return JSON.stringify({
    review_threads: state.reviewThreads.map((t, i) => {
      const comments = threadComments(t, i, state);
      return {
        id: t.id,
        is_resolved: t.isResolved,
        is_outdated: t.isOutdated,
        is_collapsed: t.isResolved,
        comments: comments.map((c) => ({
          body: c.body,
          path: t.path,
          ...(t.line != null && !t.isOutdated ? { line: t.line } : {}),
          original_line: t.line ?? 1,
          author: c.author,
          created_at: c.createdAt,
          updated_at: c.createdAt,
          html_url: c.url,
        })),
        total_count: comments.length,
      };
    }),
    totalCount: state.reviewThreads.length,
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: "Y3Vyc29yOnYyOpK0MjAyNi0xMC0wOVQyMzozNzo1N1rOqvqDJA==",
      endCursor: "Y3Vyc29yOnYyOpK0MjAyNi0xMC0wOVQyMzozNzo1N1rOqvqDJA==",
    },
  });
}

export function mcpReviews(state) {
  return JSON.stringify(
    allReviews(state).map((r, i) => ({
      id: 5476368339 + i,
      state: r.state,
      body: r.body,
      html_url:
        r.url ?? `https://github.com/owner/repo/pull/42#pullrequestreview-${5476368339 + i}`,
      user: mcpUser(r.author),
      commit_id: r.commit ?? state.headRefOid,
      submitted_at: r.submittedAt ?? ISO(),
      author_association: "NONE",
    })),
  );
}

export function mcpComments(state) {
  return JSON.stringify(
    state.comments.map((c, i) => ({
      id: 6091079297 + i,
      body: c.body,
      html_url: c.url,
      user: mcpUser(c.author),
      author_association: "NONE",
      reactions: {
        total_count: 0,
        "+1": 0,
        "-1": 0,
        laugh: 0,
        confused: 0,
        heart: 0,
        hooray: 0,
        rocket: 0,
        eyes: 0,
      },
      created_at: ISO(c.createdAtUnix),
      updated_at: ISO(c.createdAtUnix),
    })),
  );
}

/** list_pull_requests with head|base filter and `fields: number,title,state,head,base`. */
export const mcpPrList = (layers) =>
  JSON.stringify(
    layers.map((l) => ({
      number: l.pr,
      title: l.title,
      state: l.state === "OPEN" ? "open" : "closed",
      head: {
        ref: l.headRefName,
        sha: l.headRefOid,
        repo: { full_name: l.repo, description: "Example repository" },
      },
      base: {
        ref: l.baseRefName,
        sha: "base123",
        repo: { full_name: l.repo, description: "Example repository" },
      },
    })),
  );

/** get_job_logs with run_id + failed_only + return_content, default tail_lines 500. */
export function mcpJobLogs(log, runId, jobId, jobName, tailLines = 500) {
  const lines = log.split(/\r?\n/);
  return JSON.stringify({
    message: `Retrieved logs for 1 failed jobs`,
    run_id: runId,
    total_jobs: 1,
    failed_jobs: 1,
    logs: [
      {
        job_id: jobId,
        job_name: jobName,
        logs_content: lines.slice(-tailLines).join("\n"),
        original_length: lines.length,
      },
    ],
    return_format: { content: true, urls: false },
  });
}

// --- cost -------------------------------------------------------------------

/** Apply the host's per-call output cap. */
function capped(call) {
  const raw = tokens(call.out);
  const cap =
    call.via === "mcp"
      ? MODEL.mcpOutputCapTokens
      : Math.ceil(MODEL.bashOutputCapChars / MODEL.charsPerToken);
  return { cmdTokens: tokens(call.cmd), outTokens: Math.min(raw, cap), truncated: raw > cap };
}

/**
 * Cost of one run of calls, in "input-token equivalents" (ITE): what the same
 * spend would buy in uncached input tokens.
 *
 * Calls are grouped into phases. One phase is one model turn: the model emits
 * every call in the phase in parallel, then reads all their results. Each
 * phase costs one request, which re-reads the context so far from cache and
 * writes the tokens added since the previous request to cache.
 *
 * The request that reads a run's last results is the one that emits the next
 * run's first calls, so it is charged there, as the next run's first request.
 * This run pays only the cache write of its last results. Charging a read on
 * both sides of that boundary would add one base-context read per scenario to
 * every arm.
 *
 * `extraContext` is carried on every request: setup output that stays in
 * context, or tool schemas a host loads up front.
 */
export function cost(calls, { extraContext = 0 } = {}) {
  const phases = [...new Set(calls.map((c) => c.phase))].sort((a, b) => a - b);
  let context = MODEL.baseContextTokens + extraContext;
  let ite = 0;
  let pending = 0;
  let cmdTotal = 0;
  let outTotal = 0;
  let truncated = 0;
  for (const p of phases) {
    // Request that emits this phase's calls.
    ite += MODEL.cacheReadMultiplier * context + MODEL.cacheWriteMultiplier * pending;
    context += pending;
    pending = 0;
    for (const call of calls.filter((c) => c.phase === p)) {
      const t = capped(call);
      cmdTotal += t.cmdTokens;
      outTotal += t.outTokens;
      truncated += t.truncated ? 1 : 0;
      ite += MODEL.outputMultiplier * t.cmdTokens;
      pending += t.cmdTokens + t.outTokens;
    }
  }
  ite += MODEL.cacheWriteMultiplier * pending;
  return {
    calls: calls.length,
    turns: phases.length,
    toolTokens: cmdTotal + outTotal,
    ite: Math.round(ite),
    truncated,
  };
}

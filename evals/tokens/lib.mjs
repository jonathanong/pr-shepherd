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
  // A uniform 3.5 chars/token for every arm. The real sessions measured 2.19
  // for pr-shepherd's output and 2.53 for tool output overall, so this
  // undercounts pr-shepherd most; REPORT.md's sensitivity section re-scores
  // every step at the measured ratios.
  charsPerToken: 3.5,
  // Claude Code truncates Bash output past 30,000 characters. It rejects an
  // MCP result past 25,000 tokens outright, returning only an error.
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
  // Recorded URLs point at the source PR; re-home them, anchors kept.
  const home = (url) =>
    url?.replace(history.source, `https://github.com/${state.repo}/pull/${state.number}`);
  const rehome = (item) => ({ ...item, url: home(item.url) });
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
        comments: t.comments.map(rehome),
      })),
    ],
    comments: [
      ...state.comments,
      ...history.comments.map((c) => ({
        ...rehome(c),
        id: `IC_${c.id}`,
        createdAtUnix: ts(c.createdAt),
      })),
    ],
    historyReviews: history.reviews.map(rehome),
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

/** The error Claude Code returns in place of an oversized MCP result. */
export const mcpOversizeError = (call) =>
  `Error: MCP tool "${call.cmd.split(" ")[0]}" response (${tokens(call.out)} tokens) exceeds maximum allowed tokens (${MODEL.mcpOutputCapTokens}). Please use pagination, filtering, or limit parameters to reduce the response size.`;

/** Apply the host's per-call output cap: truncate Bash, reject MCP. */
function capped(call) {
  const raw = tokens(call.out);
  const cmdTokens = tokens(call.cmd);
  if (call.via === "mcp") {
    const rejected = raw > MODEL.mcpOutputCapTokens;
    return {
      cmdTokens,
      outTokens: rejected ? tokens(mcpOversizeError(call)) : raw,
      truncated: rejected,
    };
  }
  const cap = Math.ceil(MODEL.bashOutputCapChars / MODEL.charsPerToken);
  return { cmdTokens, outTokens: Math.min(raw, cap), truncated: raw > cap };
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
 * A call marked `continues` is the tail of a blocking call that an earlier
 * step started: its output lands in context with no request, turn or command
 * of its own.
 *
 * `extraContext` is carried on every request: setup output that stays in
 * context, or tool schemas a host loads up front.
 */
export function cost(allCalls, { extraContext = 0 } = {}) {
  const tails = allCalls.filter((c) => c.continues);
  // A wake notification lands in context like a call result, but the agent
  // issued no command for it, so it is not counted as a call.
  const notifications = allCalls.filter((c) => c.notification).length;
  const calls = allCalls.filter((c) => !c.continues);
  const phases = [...new Set(calls.map((c) => c.phase))].sort((a, b) => a - b);
  let context = MODEL.baseContextTokens + extraContext;
  let ite = 0;
  let pending = 0;
  let cmdTotal = 0;
  let outTotal = 0;
  let truncated = 0;
  for (const tail of tails) {
    const t = capped(tail);
    outTotal += t.outTokens;
    pending += t.outTokens;
  }
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
    calls: calls.length - notifications,
    turns: phases.length,
    toolTokens: cmdTotal + outTotal,
    ite: Math.round(ite),
    truncated,
  };
}

// --- GitHub API rate-limit accounting --------------------------------------------
//
// A second, deterministic cost dimension next to tokens: how much of the GitHub
// primary rate limit one step spends. GraphQL is charged in points, REST in core
// requests; each has its own hourly bucket. All of it is assumed, not measured;
// README.md "Rate-limit assumptions" lists every assumption.
//
// A call carries `api` ({ graphqlPoints, restCore }) when its cost is not
// derivable from its command, and `apiRest` for pr-shepherd's REST-transport
// cost. Every other call is classified from its command by `callApi`, which
// throws on a command it does not recognize, so a new scenario cannot go
// uncounted.

export const NO_API = { graphqlPoints: 0, restCore: 0 };
export const gql = (graphqlPoints) => ({ graphqlPoints, restCore: 0 });
export const rest = (restCore) => ({ graphqlPoints: 0, restCore });

export const MCP_API = readJson("mcp-api-map.json");

/**
 * Pin the MCP rate-limit map to `source`. A check against one commit says
 * nothing about another, so repinning to a different commit resets `verified`.
 */
export function repinMcpApiMap(map, source) {
  if (map.source !== source) map.verified = false;
  map.source = source;
  return map;
}

/** The report's sentence on the MCP map, taken from its `verified` flag. */
export function mcpVerificationNote(map) {
  return map.verified
    ? `The MCP mapping is verified against ${map.source}.`
    : "The MCP mapping is unverified.";
}

/** Rate-limit cost of one GitHub MCP tool call, from data/mcp-api-map.json. */
export function mcpApi(tool, args) {
  const key =
    tool === "pull_request_read"
      ? `pull_request_read:${args.method}`
      : tool === "get_job_logs"
        ? `get_job_logs:${args.job_id ? "job" : "run"}`
        : tool === "update_pull_request"
          ? "update_pull_request:draft"
          : tool;
  const entry = MCP_API.tools[key];
  if (!entry) throw new Error(`no rate-limit cost for MCP call ${key}; add it to mcp-api-map.json`);
  return { graphqlPoints: entry.graphqlPoints, restCore: entry.restCore };
}

/**
 * pr-shepherd's one-PR tick (docs/graphql-usage.md). A cold tick is one
 * `BatchPr` point, and an unchanged wait tick is one `PrFingerprint` point.
 */
export const SHEPHERD_TICK_API = gql(1);
/**
 * The first changed tick after a fingerprint-skipped wait reads the fingerprint,
 * misses, and then reads `BatchPr`: one point on top of `SHEPHERD_TICK_API`.
 */
export const SHEPHERD_CHANGED_TICK_GRAPHQL = 1;
/**
 * `BatchPr` supplement: a full tick whose completed check runs report
 * annotations (`hasAnnotations`) that are not in the 1-hour per-check-run cache
 * runs `CheckRunAnnotationsBatch`, 1 point per chunk of 20 uncached check runs
 * (src/github/check-annotations-batch.mts). On REST each uncached check run is
 * one annotation read. Charged only by scenarios whose check runs carry
 * annotations.
 */
export const annotationBatchApi = (checkRuns) => ({
  graphqlPoints: Math.ceil(checkRuns / 20),
  restCore: checkRuns,
});
/**
 * `BatchPr` supplement: a non-stack PR whose base has a required status context
 * that no check has reported yet runs `BaseBehind` (1 point,
 * src/github/merge-target-rules.mts) on full ticks and again on every
 * fingerprint-hit tick. No scenario has an unreported required context, so
 * none charges it.
 */
export const BASE_BEHIND_GRAPHQL = 1;
/**
 * Once an elapsed ready-delay marker or a stored READY receipt makes it likely
 * to be needed, `BatchPr` also selects the `PollSummaryPr` receipt sibling:
 * 2 points instead of 1 (docs/graphql-usage.md). REST derives the receipt from
 * the same snapshot, so its tick does not change.
 */
export const SHEPHERD_RECEIPT_TICK_API = gql(2);
/**
 * Standard REST (an explicit `--transport rest`, or `auto` after a GraphQL
 * fallback outside the Claude Code cloud). It has no fingerprint shortcut: 14
 * requests for one PR's full snapshot (pull, review comments, check runs,
 * protection, check suites, stacks, rules, issue comments, statuses, reviews,
 * workflow runs, viewer, repository, and a second pull read), counted at the
 * HTTP boundary of the REST iterate test routes, and measured live with an
 * explicit `--transport rest` (data/api-usage-check.json). None of them is
 * conditional, so none can be a free 304. The cloud variant is its own arm
 * (`SHEPHERD_TICK_API_CLOUD`).
 */
export const SHEPHERD_TICK_API_REST = rest(14);
/**
 * Cloud REST: `auto` picks REST when CLAUDE_CODE_REMOTE=true, and each PR
 * snapshot there also reads `/ccr/review_threads`
 * (src/github/rest-feedback-read.mts), one more request per PR. The cloud
 * proxy also supports the ready-for-review POST and one resolve POST per
 * thread, which standard REST lacks. Calls whose REST cost differs carry an
 * explicit `apiCloud`.
 */
export const CCR_REQUESTS_PER_PR = 1;
export const SHEPHERD_TICK_API_CLOUD = rest(SHEPHERD_TICK_API_REST.restCore + CCR_REQUESTS_PER_PR);
/**
 * A tick whose status is READY re-reads the PR's mergeability over REST before
 * acting (refreshReadyMergeability in src/commands/check.mts), on either
 * transport. The real sessions measured exactly one such request on each of
 * their 21 READY polls (data/real-sessions.json).
 */
/** `apply review --require-sha`'s head read: `GetPrHeadSha` or one REST pull read. */
export const HEAD_SHA_READ = 1;

export const READY_MERGEABILITY_REST = 1;
/** `call`, a READY tick: its cost on every transport plus the mergeability refresh. */
export function readyTick(call) {
  const add = (transport) => {
    const a = callApi(call, transport);
    return { ...a, restCore: a.restCore + READY_MERGEABILITY_REST };
  };
  return { ...call, api: add("graphql"), apiRest: add("rest"), apiCloud: add("cloud") };
}
/** A stack tick: one topology query plus about 0.52 points per layer, at least 1. */
export const stackTickApi = (layers) => gql(1 + Math.max(1, Math.round(0.52 * layers)));
/**
 * Standard REST stack tick: about 6 shared requests plus 12 per layer (126 for
 * 10 layers without CLAUDE_CODE_REMOTE in rest-stack-summary-sharing.test.mts).
 */
export const stackTickApiRest = (layers) => rest(6 + 12 * layers);
/** Cloud REST stack tick: 6 shared plus 13 per layer (136 for 10 layers in the same test). */
export const stackTickApiCloud = (layers) => rest(6 + (12 + CCR_REQUESTS_PER_PR) * layers);

// --- event arm (informational, not gated) ---------------------------------------
//
// A local session where a background `pr-shepherd wait` replaces the polling
// loop. It is a model of a command that does not exist yet (the webhook/event
// source brainstorm, #544). Every number here is ASSUMED; README.md "Event
// arm" lists each one.

/**
 * REST endpoints the wait's change detectors read with `If-None-Match`, per PR:
 * the pull, the head commit's check runs, reviews, issue comments and review
 * comments.
 */
export const EVENT_DETECTORS = [
  "pulls/{n}",
  "commits/{head}/check-runs",
  "pulls/{n}/reviews",
  "issues/{n}/comments",
  "pulls/{n}/comments",
];
/** Seconds between detector rounds: the poll arm's interval, so latency is unchanged. */
export const DETECTOR_POLL_SECONDS = 60;
/**
 * A 304 costs no primary rate limit (GitHub REST docs, conditional requests),
 * only latency. A 200 is one REST core request.
 */
export const DETECTOR_304 = rest(0);
export const DETECTOR_200 = rest(1);
/** A full snapshot every this many minutes since the last one, which also wakes the agent. */
export const RECONCILE_MINUTES = 15;
/**
 * What the host returns when the agent starts `wait` in the background. The
 * agent's next request reads it and ends the turn, so every wake costs one
 * more request than the poll arm's blocking call.
 */
export const BACKGROUND_ACK =
  "Command running in background with ID: b7k2m9q. You will be notified when it completes.";

/**
 * Rate-limit cost of one call, for pr-shepherd on the given transport:
 * "graphql", "rest" (standard REST) or "cloud" (REST through the CCR proxy).
 * "proxy" is the hypothetical hosted webhook proxy row of the event arm: a
 * call's `apiProxy`, when set, is what it spends against the user's token.
 */
export function callApi(call, transport = "graphql") {
  if (transport === "cloud" && call.apiCloud) return call.apiCloud;
  if (transport === "cloud" && call.apiRest)
    throw new Error(`call with a REST cost needs an apiCloud: ${call.cmd.slice(0, 80)}`);
  if (transport === "rest" && call.apiRest) return call.apiRest;
  if (transport === "proxy" && call.apiProxy) return call.apiProxy;
  if (call.api) return call.api;
  const cmd = call.cmd;
  if (call.via === "mcp") {
    const m = cmd.match(/^(\w+) (\{.*\})$/s);
    if (m) return mcpApi(m[1], JSON.parse(m[2]));
  }
  if (/^(Skill|Read|ToolSearch) /.test(cmd) || /^sleep \d+$/.test(cmd)) return NO_API;
  if (/^pr-shepherd /.test(cmd)) {
    if (/ --stack /.test(cmd)) throw new Error(`stack tick needs an explicit api: ${cmd}`);
    if (transport === "cloud") return SHEPHERD_TICK_API_CLOUD;
    return transport === "rest" ? SHEPHERD_TICK_API_REST : SHEPHERD_TICK_API;
  }
  if (/gh stack merge/.test(cmd)) return rest(2);
  if (/gh run view/.test(cmd)) return rest(2);
  if (/gh pr (view|checks)/.test(cmd) && !/--watch/.test(cmd)) return gql(1);
  if (/gh pr (ready|merge)/.test(cmd)) return gql(2);
  if (/gh api\b/.test(cmd)) return /graphql/.test(cmd) ? gql(1) : rest(1);
  throw new Error(`no rate-limit cost for call: ${cmd.slice(0, 80)}`);
}

/** Sum the rate-limit cost of a run of calls, `continues` tails included. */
export function apiTotals(calls, { transport = "graphql" } = {}) {
  return calls.reduce(
    (t, c) => {
      const a = callApi(c, transport);
      return {
        graphqlPoints: t.graphqlPoints + a.graphqlPoints,
        restCore: t.restCore + a.restCore,
      };
    },
    { ...NO_API },
  );
}

// Token-cost scenarios. Each scenario is one step of a PR's life, played three
// ways over identical GitHub content:
//
//   shepherd  the pr-shepherd skill: one CLI call per tick, plus the printed
//             `apply review` command when the output generates one
//   gh        a competent agent with the gh CLI and no plugin
//   mcp       a competent agent with the GitHub MCP server and no plugin
//
// The content comes from a test-cases fixture, so the shepherd arm's output is
// the fixture's CI-checked snapshot, byte for byte. The baselines' payloads are
// rendered from that same fixture with real response shapes (see lib.mjs).
//
// `weight` is how many times the step happens in one typical PR session. The
// weighted sum is the session total. The weights are assumptions, stated in
// README.md, not measurements.
//
// What no arm counts: the agent's own code edits, commits and pushes, and its
// reasoning. Those are the same work whichever tool fetches the state.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatMutateResult } from "../../src/cli/mutate-formatter.mts";
import { buildLogExcerpt } from "../../src/checks/log-excerpt.mts";
import {
  REPO_ROOT,
  GH_THREADS_CMD,
  GH_VIEW_CMD,
  fixtureState,
  ghLogFailed,
  ghPrChecks,
  ghPrView,
  ghThreads,
  mcpCheckRuns,
  mcpComments,
  mcpGet,
  mcpJobLogs,
  mcpReviewThreads,
  mcpReviews,
  readData,
  readJson,
  snapshot,
  tail,
  withHistory,
} from "./lib.mjs";

const PR = "https://github.com/owner/repo/pull/42";
const SHEPHERD_CMD = `pr-shepherd ${PR} --until-terminal`;
const HISTORY = readJson("history-pr505.json");

// How long one CI run takes, and how often a baseline agent re-checks it.
// pr-shepherd's poll returns after poll.timeoutSeconds (built-in 4.5m) at most.
const CI_MINUTES = 6;
const BASELINE_POLL_MINUTES = 1;
const SHEPHERD_POLL_MINUTES = 4.5;

// --- arms -------------------------------------------------------------------

const shepherdTick = (out, phase = 1) => ({ phase, via: "bash", cmd: SHEPHERD_CMD, out });

/** Run the printed `apply review:` command and read its output. */
function shepherdApply(text, result, phase = 2) {
  const cmd = text.match(/apply review: `([^`]+)`/)?.[1];
  if (!cmd) throw new Error("snapshot has no apply review command");
  const filled = cmd
    .replace("$DISMISS_MESSAGE", "Renamed the variable as requested.")
    .replace("$HEAD_SHA", "0123456789abcdef0123456789abcdef01234567");
  return { phase, via: "bash", cmd: filled, out: formatMutateResult({ errors: [], ...result }) };
}

/** Everything a baseline must read to decide what a tick needs. */
const ghObserve = (state, phase = 1) => [
  { phase, via: "bash", cmd: GH_VIEW_CMD, out: ghPrView(state) },
  { phase, via: "bash", cmd: GH_THREADS_CMD, out: ghThreads(state) },
];

const mcpCall = (phase, tool, args, out) => ({
  phase,
  via: "mcp",
  cmd: `${tool} ${JSON.stringify({ owner: "owner", repo: "repo", ...args })}`,
  out,
});

const mcpObserve = (state, phase = 1) => [
  mcpCall(phase, "pull_request_read", { method: "get", pullNumber: 42 }, mcpGet(state)),
  mcpCall(
    phase,
    "pull_request_read",
    { method: "get_check_runs", pullNumber: 42 },
    mcpCheckRuns(state),
  ),
  mcpCall(
    phase,
    "pull_request_read",
    { method: "get_review_comments", pullNumber: 42 },
    mcpReviewThreads(state),
  ),
  mcpCall(phase, "pull_request_read", { method: "get_reviews", pullNumber: 42 }, mcpReviews(state)),
  mcpCall(
    phase,
    "pull_request_read",
    { method: "get_comments", pullNumber: 42 },
    mcpComments(state),
  ),
];

// A REST reply echoes the full review-comment object back.
const REST_COMMENT = readData("rest-review-comment.json");
const ghReply = (commentId, phase = 2) => ({
  phase,
  via: "bash",
  cmd: `gh api -X POST repos/owner/repo/pulls/42/comments/${commentId}/replies -f body='Renamed the variable as requested.'`,
  out: JSON.stringify(JSON.parse(REST_COMMENT)),
});

// github-mcp-server answers a reply with a MinimalResponse.
const mcpReply = (commentId, phase = 2) =>
  mcpCall(
    phase,
    "add_reply_to_pull_request_comment",
    { pullNumber: 42, commentId, body: "Renamed the variable as requested." },
    JSON.stringify({ id: "4179115943", url: `${PR}#discussion_r4179115943` }),
  );

// --- the real CI failure ----------------------------------------------------

const JOB_ID = 110714612462;
const RUN_ID = 34906500059;
const JOB_LOG = readData(`job-${JOB_ID}.txt`);
const JOB_NAME = readJson(`job-${JOB_ID}.steps.json`).name;
const FAILED_STEP = "Run npm run test:coverage";

/**
 * Snapshot 92 renders a fixture's two-line log excerpt. Swap in the excerpt
 * pr-shepherd's own log-excerpt code builds from the real job log, rendered
 * the way the iterate formatter renders every excerpt line.
 */
function failingCheckOutput() {
  const text = snapshot("92-fix-code-failing-check-first-failed-step");
  const fixtureExcerpt = [
    "  > Check benchmark results",
    "  > Benchmark build or execution failed.",
    "  > ##[error]Process completed with exit code 1.",
  ].join("\n");
  if (!text.includes(fixtureExcerpt)) throw new Error("snapshot 92 excerpt moved");
  const real = buildLogExcerpt(JOB_LOG);
  const rendered = [`  > ${FAILED_STEP}`, ...real.split("\n").map((l) => `  > ${l}`)].join("\n");
  return text.replace(fixtureExcerpt, rendered);
}

// --- scenarios --------------------------------------------------------------

export const SCENARIOS = [
  {
    id: "session-setup",
    weight: 1,
    title: "One-time setup",
    note: "Skill + two playbooks for shepherd; on-demand tool schemas for MCP; nothing for gh.",
    arms() {
      const skillDir = join(REPO_ROOT, "plugins", "pr-shepherd", "skills", "pr-shepherd");
      const read = (p) => readFileSync(join(skillDir, p), "utf8");
      const schemas = readJson("mcp-tool-schemas.json");
      return {
        shepherd: [
          {
            phase: 1,
            via: "bash",
            cmd: 'Skill {"skill":"pr-shepherd:pr-shepherd"}',
            out: read("SKILL.md"),
          },
          {
            phase: 2,
            via: "bash",
            cmd: "Read references/ci-failure-triage.md",
            out: read("references/ci-failure-triage.md"),
          },
          {
            phase: 2,
            via: "bash",
            cmd: "Read references/review-mutations.md",
            out: read("references/review-mutations.md"),
          },
        ],
        gh: [],
        mcp: [
          {
            phase: 1,
            via: "mcp",
            cmd: `ToolSearch {"query":"select:${Object.keys(schemas.tools).join(",")}"}`,
            out: Object.values(schemas.tools).join("\n"),
          },
        ],
      };
    },
  },

  {
    id: "ci-wait",
    weight: 2,
    title: `Wait out one ${CI_MINUTES}-minute CI run`,
    note: `Baselines re-check every ${BASELINE_POLL_MINUTES}m; shepherd's poll returns every ${SHEPHERD_POLL_MINUTES}m at most. MCP has no sleep, so each MCP poll is a Bash sleep plus a call.`,
    arms() {
      const fixture = "09-wait-in-progress-ci";
      const state = fixtureState(fixture);
      const polls = Math.ceil(CI_MINUTES / BASELINE_POLL_MINUTES);
      const ticks = Math.ceil(CI_MINUTES / SHEPHERD_POLL_MINUTES);
      return {
        shepherd: Array.from({ length: ticks }, (_, i) => shepherdTick(snapshot(fixture), i + 1)),
        gh: Array.from({ length: polls }, (_, i) => ({
          phase: i + 1,
          via: "bash",
          cmd: "sleep 60 && gh pr checks 42",
          out: ghPrChecks(state),
        })),
        mcp: Array.from({ length: polls }, (_, i) => [
          { phase: 2 * i + 1, via: "bash", cmd: "sleep 60", out: "" },
          mcpCall(
            2 * i + 2,
            "pull_request_read",
            { method: "get_check_runs", pullNumber: 42 },
            mcpCheckRuns(state),
          ),
        ]).flat(),
      };
    },
  },

  {
    id: "failing-check",
    weight: 1,
    title: "Triage a real failing CI job",
    note: `Real 194 KB log of job ${JOB_ID} (a vitest snapshot failure). gh tails the failed step; MCP uses get_job_logs' default 500-line tail.`,
    arms() {
      const state = fixtureState("92-fix-code-failing-check-first-failed-step");
      const logFailed = ghLogFailed(
        JOB_LOG,
        JOB_NAME,
        FAILED_STEP,
        /##\[group\]Run npm run test:coverage/,
        /##\[group\]Run codecov\//,
      );
      return {
        shepherd: [shepherdTick(failingCheckOutput())],
        gh: [
          ...ghObserve(state),
          {
            phase: 2,
            via: "bash",
            cmd: `gh run view ${RUN_ID} --log-failed | tail -n 200`,
            out: tail(logFailed, 200),
          },
        ],
        mcp: [
          ...mcpObserve(state),
          mcpCall(
            2,
            "get_job_logs",
            { run_id: RUN_ID, failed_only: true, return_content: true },
            mcpJobLogs(JOB_LOG, RUN_ID, JOB_ID, JOB_NAME),
          ),
        ],
      };
    },
  },

  {
    id: "bot-review-summary",
    weight: 1,
    title: "First look at a review summary",
    note: "A COMMENTED review body arrives with green CI.",
    arms() {
      const fixture = "22-fix-code-review-summary-first-look";
      const state = fixtureState(fixture);
      return {
        shepherd: [shepherdTick(snapshot(fixture))],
        gh: ghObserve(state),
        mcp: mcpObserve(state),
      };
    },
  },

  {
    id: "review-thread",
    weight: 1,
    title: "Fix and reply to a review thread",
    note: "Read the thread, then reply after the fix.",
    arms() {
      const fixture = "16-fix-code-review-thread";
      const state = fixtureState(fixture);
      const text = snapshot(fixture);
      return {
        shepherd: [shepherdTick(text), shepherdApply(text, { repliedThreads: ["PRRT_active"] })],
        gh: [...ghObserve(state), ghReply(1)],
        mcp: [...mcpObserve(state), mcpReply(1)],
      };
    },
  },

  {
    id: "review-thread-with-history",
    weight: 1,
    title: "Same thread, after a review round",
    note: "As above, on a PR already carrying #505's real history: three bot reviews, two resolved threads, three bot issue comments.",
    arms() {
      const fixture = "16-fix-code-review-thread";
      const state = withHistory(fixtureState(fixture), HISTORY);
      const text = snapshot(fixture);
      return {
        shepherd: [shepherdTick(text), shepherdApply(text, { repliedThreads: ["PRRT_active"] })],
        gh: [...ghObserve(state), ghReply(1)],
        mcp: [...mcpObserve(state), mcpReply(1)],
      };
    },
  },

  {
    id: "multi-category",
    weight: 0.5,
    title: "Thread, comment, failing check and changes-requested review at once",
    note: "No log fetch in any arm: the fixture carries no log, so both arms see only the failed step.",
    arms() {
      const fixture = "54-fix-code-multi-category-threads-comments-checks-changes";
      const state = fixtureState(fixture);
      const text = snapshot(fixture);
      return {
        shepherd: [shepherdTick(text), shepherdApply(text, { repliedThreads: ["PRRT_multi"] })],
        gh: [...ghObserve(state), ghReply(54)],
        mcp: [...mcpObserve(state), mcpReply(54)],
      };
    },
  },

  {
    id: "mark-ready",
    weight: 1,
    title: "Mark a clean draft ready",
    note: "With #505's history. The shepherd CLI marks the PR ready itself.",
    arms() {
      const fixture = "07-mark-ready-draft-clean";
      const state = withHistory(fixtureState(fixture), HISTORY);
      return {
        shepherd: [shepherdTick(snapshot(fixture))],
        gh: [
          ...ghObserve(state),
          {
            phase: 2,
            via: "bash",
            cmd: "gh pr ready 42",
            out: '✓ Pull request owner/repo#42 is marked as "ready for review"\n',
          },
        ],
        mcp: [
          ...mcpObserve(state),
          mcpCall(
            2,
            "update_pull_request",
            { pullNumber: 42, draft: false },
            JSON.stringify({ id: "4806993654", url: PR }),
          ),
        ],
      };
    },
  },

  {
    id: "merged",
    weight: 1,
    title: "Notice the PR merged and stop",
    note: "With #505's history.",
    arms() {
      const fixture = "01-cancel-merged";
      const state = withHistory(fixtureState(fixture), HISTORY);
      return {
        shepherd: [shepherdTick(snapshot(fixture))],
        gh: ghObserve(state),
        mcp: mcpObserve(state),
      };
    },
  },
];

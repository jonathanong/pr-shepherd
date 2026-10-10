// Token-cost scenarios. Each scenario is one step of a PR's or a stack's life,
// played three ways over identical GitHub content:
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
// `session` groups scenarios into a typical PR session or a typical stack
// session, and `weight` is how many times the step happens in one. The
// weighted sum is the session total. The weights are assumptions, stated in
// README.md, not measurements.
//
// What no arm counts: the agent's own code edits, commits and pushes, and its
// reasoning. Those are the same work whichever tool fetches the state.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWithExecutionCwd } from "../../src/execution-context.mts";
import { formatMutateResult } from "../../src/cli/mutate-formatter.mts";
import { buildLogExcerpt } from "../../src/checks/log-excerpt.mts";
import {
  REPO_ROOT,
  fixtureCommentId,
  ghThreadsCmd,
  ghViewCmd,
  fixtureInput,
  fixtureState,
  ghAnnotations,
  ghFailingCheckRuns,
  ghPrList,
  GH_LIST_FIELDS,
  mcpPrList,
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
const CI_MINUTES = 6;
const BASELINE_POLL_MINUTES = 1;

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
  {
    phase,
    via: "bash",
    cmd: ghViewCmd(state),
    out: ghPrView(state),
  },
  {
    phase,
    via: "bash",
    cmd: ghThreadsCmd(state),
    out: ghThreads(state),
  },
];

const mcpCall = (phase, tool, args, out, repo = "owner/repo") => {
  const [owner, name] = repo.split("/");
  return {
    phase,
    via: "mcp",
    cmd: `${tool} ${JSON.stringify({ owner, repo: name, ...args })}`,
    out,
  };
};

const mcpObserve = (state, phase = 1) => [
  mcpCall(
    phase,
    "pull_request_read",
    { method: "get", pullNumber: state.number },
    mcpGet(state),
    state.repo,
  ),
  mcpCall(
    phase,
    "pull_request_read",
    { method: "get_check_runs", pullNumber: state.number },
    mcpCheckRuns(state),
    state.repo,
  ),
  mcpCall(
    phase,
    "pull_request_read",
    { method: "get_review_comments", pullNumber: state.number },
    mcpReviewThreads(state),
    state.repo,
  ),
  mcpCall(
    phase,
    "pull_request_read",
    { method: "get_reviews", pullNumber: state.number },
    mcpReviews(state),
    state.repo,
  ),
  mcpCall(
    phase,
    "pull_request_read",
    { method: "get_comments", pullNumber: state.number },
    mcpComments(state),
    state.repo,
  ),
];

// A REST reply echoes the full review-comment object back; `--silent` drops it.
const ghReply = (commentId, phase = 2) => ({
  phase,
  via: "bash",
  cmd: `gh api --silent -X POST repos/owner/repo/pulls/42/comments/${commentId}/replies -f body='Renamed the variable as requested.'`,
  out: "",
});

// github-mcp-server answers a reply with a MinimalResponse.
const mcpReply = (commentId, phase = 2) =>
  mcpCall(
    phase,
    "add_reply_to_pull_request_comment",
    { pullNumber: 42, commentId, body: "Renamed the variable as requested." },
    JSON.stringify({ id: "4179115943", url: `${PR}#discussion_r4179115943` }),
  );

// A GraphQL resolve answers with the thread state only.
const ghResolve = (threadId, phase = 2) => ({
  phase,
  via: "bash",
  cmd: `gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "${threadId}"}) { thread { isResolved } } }'`,
  out: JSON.stringify({ data: { resolveReviewThread: { thread: { isResolved: true } } } }),
});

const mcpResolve = (threadId, phase = 2) =>
  mcpCall(phase, "resolve_review_thread", { threadId }, "review thread resolved successfully");

// Guarded like shepherd's `--match-head-commit`: refuse a head the agent did not see.
const mcpMerge = (pullNumber, sha, { phase = 2, method = "merge", repo } = {}) =>
  mcpCall(
    phase,
    "merge_pull_request",
    { pullNumber, merge_method: method, expectedHeadSha: sha },
    JSON.stringify({ sha, merged: true, message: "Pull Request successfully merged" }),
    repo,
  );

// --- the real CI failure ----------------------------------------------------

/**
 * buildLogExcerpt applies `checks.ignoreLogLines` from the nearest
 * .pr-shepherdrc.yml and the one in $HOME. Run it from an empty directory that
 * is also $HOME, so a developer's own config cannot change the report.
 */
function excerptWithDefaultConfig(log) {
  const dir = mkdtempSync(join(tmpdir(), "pr-shepherd-tokens-"));
  const home = process.env.HOME;
  process.env.HOME = dir;
  try {
    return runWithExecutionCwd(dir, () => buildLogExcerpt(log));
  } finally {
    process.env.HOME = home;
    rmSync(dir, { recursive: true, force: true });
  }
}

const JOB_ID = 110714612462;
const JOB_LOG = readData(`job-${JOB_ID}.txt`);
const { runId: RUN_ID, name: JOB_NAME } = readJson(`job-${JOB_ID}.steps.json`);
const FAILED_STEP = "Run npm run test:coverage";

// Snapshot 92's fixture names its own run and job. Both arms see the recorded
// job's IDs instead, so every command targets the run the log came from.
const FIXTURE_RUN_ID = "34906500059";
const FIXTURE_JOB_ID = "104190467372";
const withRecordedIds = (text) =>
  text.replaceAll(FIXTURE_RUN_ID, String(RUN_ID)).replaceAll(FIXTURE_JOB_ID, String(JOB_ID));

function failingCheckState() {
  const state = fixtureState("92-fix-code-failing-check-first-failed-step");
  return {
    ...state,
    checks: state.checks.map((c) => ({
      ...c,
      runId: withRecordedIds(c.runId),
      detailsUrl: withRecordedIds(c.detailsUrl),
    })),
  };
}

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
  const real = excerptWithDefaultConfig(JOB_LOG);
  const rendered = [`  > ${FAILED_STEP}`, ...real.split("\n").map((l) => `  > ${l}`)].join("\n");
  return withRecordedIds(text.replace(fixtureExcerpt, rendered));
}

const GH_LOG_FAILED = ghLogFailed(
  JOB_LOG,
  JOB_NAME,
  FAILED_STEP,
  /##\[group\]Run npm run test:coverage/,
  /##\[group\]Run codecov\//,
);

/** `gh run view --log-failed`, tailed: the failure summary ends the step. */
const ghLogCall = (phase) => ({
  phase,
  via: "bash",
  cmd: `gh run view ${RUN_ID} --log-failed -R owner/repo | tail -n 200`,
  out: tail(GH_LOG_FAILED, 200),
});

/**
 * get_job_logs' default 500-line tail of this log is all Codecov upload and
 * post-job steps. The first FAIL line sits 852 lines from the end, so the
 * agent asks again for a 1000-line tail of the failed job.
 */
const mcpLogCalls = (phase) => [
  mcpCall(
    phase,
    "get_job_logs",
    { run_id: RUN_ID, failed_only: true, return_content: true },
    mcpJobLogs(JOB_LOG, RUN_ID, JOB_ID, JOB_NAME),
  ),
  mcpCall(
    phase + 1,
    "get_job_logs",
    { job_id: JOB_ID, return_content: true, tail_lines: 1000 },
    mcpJobLogs(JOB_LOG, RUN_ID, JOB_ID, JOB_NAME, 1000),
  ),
];

// --- scenarios --------------------------------------------------------------

const SKILL_DIR = join(REPO_ROOT, "plugins", "pr-shepherd", "skills", "pr-shepherd");
const readSkill = (p) => readFileSync(join(SKILL_DIR, p), "utf8");

// SKILL.md links each playbook by the name outputs use: `- [Name](references/x.md)`.
const PLAYBOOK_FILES = Object.fromEntries(
  [...readSkill("SKILL.md").matchAll(/^- \[([^\]]+)\]\((references\/[^)]+)\)$/gm)].map((m) => [
    m[1],
    m[2],
  ]),
);

/**
 * One-time cost per session, derived from the session's other scenarios: the
 * skill plus every playbook a shepherd output names (the skill reads each once),
 * and the schema of every GitHub MCP tool the MCP arm calls. gh needs nothing.
 */
function setupScenario({ id, session }) {
  return {
    id,
    session,
    setup: true,
    weight: 1,
    title: "One-time setup",
    arms() {
      const ticks = SCENARIOS.filter((s) => s.session === session && !s.setup).map((s) => s.arms());
      const shepherdText = ticks.flatMap((a) => a.shepherd.map((c) => c.out)).join("\n");
      const playbooks = [
        ...new Set([...shepherdText.matchAll(/Playbook: "([^"]+)"/g)].map((m) => m[1])),
      ].sort();
      const tools = [
        ...new Set(
          ticks.flatMap((a) =>
            a.mcp.filter((c) => c.via === "mcp").map((c) => c.cmd.split(" ")[0]),
          ),
        ),
      ].sort();
      const schemas = readJson("mcp-tool-schemas.json").tools;
      return {
        note: `Skill + ${playbooks.join(", ")} playbooks for shepherd; ${tools.join(", ")} schemas for MCP; nothing for gh.`,
        shepherd: [
          {
            phase: 1,
            via: "bash",
            cmd: 'Skill {"skill":"pr-shepherd:pr-shepherd"}',
            out: readSkill("SKILL.md"),
          },
          ...playbooks.map((name) => ({
            phase: 2,
            via: "bash",
            cmd: `Read ${PLAYBOOK_FILES[name]}`,
            out: readSkill(PLAYBOOK_FILES[name]),
          })),
        ],
        gh: [],
        mcp: [
          {
            phase: 1,
            via: "mcp",
            cmd: `ToolSearch {"query":"select:${tools.join(",")}"}`,
            out: tools
              .map((t) => {
                if (!schemas[t])
                  throw new Error(`no recorded schema for ${t}; add it to MCP_TOOLS_USED`);
                return schemas[t];
              })
              .join("\n"),
          },
        ],
      };
    },
  };
}

const PR_SCENARIOS = [
  setupScenario({ id: "session-setup", session: "pr" }),

  {
    id: "ci-wait",
    weight: 2,
    title: `Wait out one ${CI_MINUTES}-minute CI run`,
    note: `Baselines re-check every ${BASELINE_POLL_MINUTES}m. With --until-terminal, shepherd's one call blocks until CI settles and prints a stderr line per poll; its final result is the next scenario's tick, so that call is counted twice against shepherd. MCP has no sleep, so each MCP poll is a Bash sleep plus a call.`,
    arms() {
      const fixture = "09-wait-in-progress-ci";
      const state = fixtureState(fixture);
      const polls = Math.ceil(CI_MINUTES / BASELINE_POLL_MINUTES);
      // poll-progress.mts, default (non-quiet) status: one line per WAIT tick.
      const reason = snapshot(fixture).match(/^WAIT: (.+)$/m)[1];
      const stderr = Array.from(
        { length: polls },
        (_, i) => `[poll tick ${i + 1} / +${i * 60}s] WAIT — ${reason}; next tick in 60s\n`,
      ).join("");
      return {
        shepherd: [{ phase: 1, via: "bash", cmd: SHEPHERD_CMD, out: stderr }],
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
    note: `Real 194 KB log of job ${JOB_ID} (a vitest snapshot failure). gh tails the failed step. MCP's default 500-line tail misses the failure, so it asks again for 1000 lines.`,
    arms() {
      const state = failingCheckState();
      return {
        shepherd: [shepherdTick(failingCheckOutput())],
        gh: [...ghObserve(state), ghLogCall(2)],
        mcp: [...mcpObserve(state), ...mcpLogCalls(2)],
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
        gh: [...ghObserve(state), ghReply(fixtureCommentId(0))],
        mcp: [...mcpObserve(state), mcpReply(fixtureCommentId(0))],
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
        gh: [...ghObserve(state), ghReply(fixtureCommentId(0))],
        mcp: [...mcpObserve(state), mcpReply(fixtureCommentId(0))],
      };
    },
  },

  {
    id: "multi-category",
    weight: 0.5,
    title: "Thread, comment, failing check and changes-requested review at once",
    note: "The output has no log excerpt, so the CI-triage playbook sends every arm to the failed log. All three read the real log from `failing-check`.",
    arms() {
      const fixture = "54-fix-code-multi-category-threads-comments-checks-changes";
      // The fixture's run 5401 becomes the recorded run, so the log every arm
      // fetches belongs to the failure the output shows.
      const recorded = (t) => t.replace(/\b5401\b/g, String(RUN_ID));
      const raw = fixtureState(fixture);
      const state = {
        ...raw,
        checks: raw.checks.map((c) => ({
          ...c,
          runId: recorded(c.runId),
          detailsUrl: recorded(c.detailsUrl),
        })),
      };
      const text = recorded(snapshot(fixture));
      return {
        shepherd: [
          shepherdTick(text),
          ghLogCall(2),
          shepherdApply(text, { repliedThreads: ["PRRT_multi"] }, 3),
        ],
        gh: [...ghObserve(state), ghLogCall(2), ghReply(fixtureCommentId(0), 3)],
        mcp: [...mcpObserve(state), ...mcpLogCalls(2), mcpReply(fixtureCommentId(0), 4)],
      };
    },
  },

  {
    id: "mark-ready",
    weight: 1,
    title: "Mark a clean draft ready",
    note: "With #505's history. Under --until-terminal the shepherd poll marks the PR ready and keeps polling without returning, so shepherd spends no call here.",
    arms() {
      const fixture = "07-mark-ready-draft-clean";
      const state = withHistory(fixtureState(fixture), HISTORY);
      return {
        shepherd: [],
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
  {
    id: "bot-threads",
    weight: 1,
    title: "Reply to one human and two bot threads, resolve the bot ones",
    note: "Five mutations. Shepherd batches them into one `apply review`; the baselines issue each one. A REST reply echoes the full comment object back.",
    arms() {
      const fixture = "45-fix-code-bot-threads-resolve-human-reply";
      const state = fixtureState(fixture);
      const text = snapshot(fixture);
      const threads = ["PRRT_human", "PRRT_bot", "PRRT_bracket_bot"];
      const bots = ["PRRT_bot", "PRRT_bracket_bot"];
      return {
        shepherd: [
          shepherdTick(text),
          shepherdApply(text, { repliedThreads: threads, resolvedThreads: bots }),
        ],
        gh: [
          ...ghObserve(state),
          ...threads.map((_, i) => ghReply(fixtureCommentId(i))),
          ...bots.map((id) => ghResolve(id)),
        ],
        mcp: [
          ...mcpObserve(state),
          ...threads.map((_, i) => mcpReply(fixtureCommentId(i))),
          ...bots.map((id) => mcpResolve(id)),
        ],
      };
    },
  },

  {
    id: "check-annotations",
    weight: 0.25,
    title: "Failing external check with line annotations",
    note: "gh must find the check-run ID, then fetch its annotations. The GitHub MCP server has no annotations tool.",
    gaps: { mcp: "cannot read check annotations" },
    arms() {
      const fixture = "42-fix-code-check-annotations";
      const state = fixtureState(fixture);
      const annotations = fixtureInput(fixture).checkAnnotationsByCheckId;
      return {
        shepherd: [shepherdTick(snapshot(fixture))],
        gh: [
          ...ghObserve(state),
          {
            phase: 2,
            via: "bash",
            cmd: `gh api repos/owner/repo/commits/${state.headRefOid}/check-runs --jq '.check_runs[] | select(.conclusion == "failure") | {id, name, output: {title: .output.title, summary: .output.summary, annotations_count: .output.annotations_count}}'`,
            out: ghFailingCheckRuns(state, annotations),
          },
          {
            phase: 3,
            via: "bash",
            cmd: "gh api repos/owner/repo/check-runs/30000000000/annotations",
            out: ghAnnotations(Object.values(annotations).flat()),
          },
        ],
        mcp: mcpObserve(state),
      };
    },
  },

  {
    id: "conflicts",
    weight: 0.5,
    title: "Branch conflicts with its base",
    note: "Shepherd also relays the repository's configured branch-update hint.",
    arms() {
      const fixture = "117-fix-code-conflicts-behind-base-hint";
      const state = fixtureState(fixture);
      return {
        shepherd: [shepherdTick(snapshot(fixture))],
        gh: ghObserve(state),
        mcp: mcpObserve(state),
      };
    },
  },

  {
    id: "merge",
    weight: 0.5,
    title: "Merge a ready PR",
    note: "Half of sessions run with --merge. Shepherd prints the guarded merge command.",
    arms() {
      const fixture = "64-merge-ready-delay-elapsed";
      const state = fixtureState(fixture);
      const merged = "✓ Merged pull request owner/repo#42 (Fixture PR)\n";
      return {
        shepherd: [
          shepherdTick(snapshot(fixture)),
          {
            phase: 2,
            via: "bash",
            cmd: "gh pr merge 42 --repo owner/repo --match-head-commit abc123 --auto --merge",
            out: merged,
          },
        ],
        gh: [
          ...ghObserve(state),
          {
            phase: 2,
            via: "bash",
            cmd: `gh pr merge 42 --match-head-commit ${state.headRefOid} --merge`,
            out: merged,
          },
        ],
        mcp: [...mcpObserve(state), mcpMerge(42, state.headRefOid)],
      };
    },
  },

  {
    id: "merge-queue",
    weight: 0.25,
    title: "Enqueue a ready PR on a merge-queue branch",
    note: "`gh pr merge` enqueues on its own. The REST merge behind MCP's merge_pull_request is refused on a queue branch, and the GitHub MCP server has no enqueue tool.",
    gaps: { mcp: "cannot enqueue" },
    arms() {
      const fixture = "65-merge-queue-required-command";
      const state = fixtureState(fixture);
      const queued =
        "✓ Pull request owner/repo#42 will be added to the merge queue for main when ready\n";
      return {
        shepherd: [
          shepherdTick(snapshot(fixture)),
          {
            phase: 2,
            via: "bash",
            cmd: "gh pr merge 42 --repo owner/repo --match-head-commit abc123",
            out: queued,
          },
        ],
        gh: [
          ...ghObserve(state),
          {
            phase: 2,
            via: "bash",
            cmd: `gh pr merge 42 --match-head-commit ${state.headRefOid}`,
            out: queued,
          },
        ],
        mcp: [
          ...mcpObserve(state),
          mcpCall(
            2,
            "merge_pull_request",
            { pullNumber: 42, merge_method: "merge", expectedHeadSha: state.headRefOid },
            "failed to merge pull request: PUT https://api.github.com/repos/owner/repo/pulls/42/merge: 405 Changes must be made through the merge queue []",
          ),
        ],
      };
    },
  },
];

// --- native stacks ------------------------------------------------------------
//
// A stack tick asks: which layers need work, and is the stack mergeable?
// pr-shepherd answers with one overview. A baseline without it walks the stack
// through its branch chain (`gh pr list --head <base>` down, `--base <head>`
// up, one layer per call), then reads every open layer in full.
//
// Each open layer's GitHub content comes from the single-PR fixture that
// matches its row: a conflicting layer reads like fixture 27, a layer with
// review work like fixture 16, a queued layer like fixture 66, any other open
// layer like the clean fixture 64.
// Where pr-shepherd routes a layer to a one-PR session, that session's first
// tick reads the same fixture, so both arms pay for the same per-layer read.

const STACK_REPO = (layer) => layer.repo ?? "owner/repo";

function layerFixture(layer) {
  if (layer.state !== "OPEN") return null;
  if (layer.reasons?.includes("merge-conflicts")) return "27-fix-code-conflicts";
  if (layer.reasons?.includes("review-work")) return "16-fix-code-review-thread";
  if (layer.reasons?.includes("already-in-merge-queue")) return "66-wait-merge-queue-active";
  return "64-merge-ready-delay-elapsed";
}

function layerState(layer) {
  return {
    ...fixtureState(layerFixture(layer)),
    repo: STACK_REPO(layer),
    number: layer.pr,
    headRefName: layer.headRefName,
    headRefOid: layer.headRefOid,
    baseRefName: layer.baseRefName,
  };
}

/** Load a stack fixture: its layers bottom to top, and the anchor's index. */
function stackFixture(name) {
  const summary = fixtureInput(name).aggregateSummary;
  const layers = [...summary.prs].sort((a, b) => a.stack.position - b.stack.position);
  const anchor = layers.findIndex((l) => l.pr === summary.selection.anchor);
  return { layers, anchor };
}

/** Discover the stack by walking its branch chain from the anchor. */
function ghDiscover(layers, anchor) {
  const a = layers[anchor];
  const calls = [
    {
      phase: 1,
      via: "bash",
      cmd: `gh pr view ${a.pr} -R ${STACK_REPO(a)} --json ${GH_LIST_FIELDS}`,
      out: ghPrList([a]).slice(1, -1),
    },
  ];
  // Down: stop once a layer's base is the trunk.
  for (let i = anchor - 1, phase = 2; i >= 0; i--, phase++) {
    calls.push({
      phase,
      via: "bash",
      cmd: `gh pr list -R ${STACK_REPO(a)} --head ${layers[i + 1].baseRefName} --state all --json ${GH_LIST_FIELDS}`,
      out: ghPrList([layers[i]]),
    });
    if (layers[i].baseRefName === "main") break;
  }
  // Up: the last call finds nothing above the top layer.
  for (let i = anchor + 1, phase = 2; i <= layers.length; i++, phase++) {
    calls.push({
      phase,
      via: "bash",
      cmd: `gh pr list -R ${STACK_REPO(a)} --base ${layers[i - 1].headRefName} --state all --json ${GH_LIST_FIELDS}`,
      out: ghPrList(layers.slice(i, i + 1)),
    });
  }
  return calls;
}

function mcpDiscover(layers, anchor) {
  const a = layers[anchor];
  const list = (phase, filter, found) =>
    mcpCall(
      phase,
      "list_pull_requests",
      { ...filter, state: "all", fields: ["number", "title", "state", "head", "base"] },
      mcpPrList(found),
      STACK_REPO(a),
    );
  const calls = [
    mcpCall(
      1,
      "pull_request_read",
      { method: "get", pullNumber: a.pr },
      mcpGet(layerState(a)),
      STACK_REPO(a),
    ),
  ];
  for (let i = anchor - 1, phase = 2; i >= 0; i--, phase++) {
    calls.push(
      list(phase, { head: `${STACK_REPO(a).split("/")[0]}:${layers[i + 1].baseRefName}` }, [
        layers[i],
      ]),
    );
    if (layers[i].baseRefName === "main") break;
  }
  for (let i = anchor + 1, phase = 2; i <= layers.length; i++, phase++) {
    calls.push(list(phase, { base: layers[i - 1].headRefName }, layers.slice(i, i + 1)));
  }
  return calls;
}

const lastPhase = (calls) => Math.max(...calls.map((c) => c.phase));
const openLayers = (layers) => layers.filter((l) => l.state === "OPEN");

/** Discovery, then every open layer read in full, in parallel. */
function stackBaselines(name) {
  const { layers, anchor } = stackFixture(name);
  const gh = ghDiscover(layers, anchor);
  const mcp = mcpDiscover(layers, anchor);
  const ghRead = lastPhase(gh) + 1;
  const mcpRead = lastPhase(mcp) + 1;
  for (const l of openLayers(layers)) {
    gh.push(...ghObserve(layerState(l), ghRead));
    mcp.push(...mcpObserve(layerState(l), mcpRead));
  }
  return { layers, anchor, gh, mcp };
}

const stackTick = (name, anchorPr, repo, flags = "") => ({
  phase: 1,
  via: "bash",
  cmd: `pr-shepherd --stack https://github.com/${repo}/pull/${anchorPr} --until-terminal${flags}`,
  out: snapshot(name),
});

const STACK_SCENARIOS = [
  setupScenario({ id: "stack-setup", session: "stack" }),

  {
    id: "stack-work",
    session: "stack",
    weight: 2,
    title: "Six-layer stack: two merged parents, four owned layers with work",
    note: "Fixture 130, from a real vouchington stack. Shepherd's overview routes four one-PR sessions, whose first ticks are counted here.",
    arms() {
      const name = "130-aggregate-stack-merged-parent-work";
      const { layers, anchor, gh, mcp } = stackBaselines(name);
      const repo = STACK_REPO(layers[anchor]);
      const routed = openLayers(layers).filter((l) => l.owned && l.action !== "cancel");
      return {
        shepherd: [
          stackTick(name, layers[anchor].pr, repo),
          ...routed.map((l) => ({
            phase: 2,
            via: "bash",
            cmd: `pr-shepherd https://github.com/${repo}/pull/${l.pr} --until-terminal`,
            out: snapshot(layerFixture(l)),
          })),
        ],
        gh,
        mcp,
      };
    },
  },

  {
    id: "stack-queue-wait",
    session: "stack",
    weight: 2,
    title: "Two-layer stack waiting in the merge queue",
    note: "Fixture 98. Nothing to do but recheck. The gh arm reads each layer's `mergeQueueEntry` in its thread query; the GitHub MCP server exposes no merge-queue state.",
    gaps: { mcp: "cannot see merge-queue membership" },
    arms() {
      const name = "98-aggregate-stack-merge-queue";
      const { layers, anchor, gh, mcp } = stackBaselines(name);
      return {
        shepherd: [stackTick(name, layers[anchor].pr, STACK_REPO(layers[anchor]), " --merge")],
        gh,
        mcp,
      };
    },
  },

  {
    id: "stack-merge",
    session: "stack",
    weight: 1,
    title: "Merge a ready two-layer stack",
    note: "Fixture 97. Shepherd prints one `gh stack merge`. Without the extension, a baseline merges bottom-up and waits for GitHub to retarget the next layer.",
    arms() {
      const name = "97-aggregate-stack-full-merge";
      const { layers, anchor, gh, mcp } = stackBaselines(name);
      const [lower, upper] = layers;
      const merged = (l) => `✓ Squashed and merged pull request owner/repo#${l.pr} (${l.title})\n`;
      const p = lastPhase(gh) + 1;
      const q = lastPhase(mcp) + 1;
      return {
        shepherd: [
          stackTick(name, layers[anchor].pr, STACK_REPO(layers[anchor]), " --merge"),
          {
            phase: 2,
            via: "bash",
            cmd: `GH_REPO=owner/repo gh stack merge ${upper.pr} --yes --squash`,
            // Approximate: one line per merged layer.
            out: layers.map(merged).join(""),
          },
        ],
        gh: [
          ...gh,
          {
            phase: p,
            via: "bash",
            cmd: `gh pr merge ${lower.pr} -R ${STACK_REPO(lower)} --match-head-commit ${lower.headRefOid} --squash`,
            out: merged(lower),
          },
          {
            phase: p + 1,
            via: "bash",
            cmd: `gh pr view ${upper.pr} -R ${STACK_REPO(upper)} --json baseRefName,mergeStateStatus`,
            out: JSON.stringify({ baseRefName: "main", mergeStateStatus: "CLEAN" }),
          },
          {
            phase: p + 2,
            via: "bash",
            cmd: `gh pr merge ${upper.pr} -R ${STACK_REPO(upper)} --match-head-commit ${upper.headRefOid} --squash`,
            out: merged(upper),
          },
        ],
        mcp: [
          ...mcp,
          mcpMerge(lower.pr, lower.headRefOid, {
            phase: q,
            method: "squash",
            repo: STACK_REPO(lower),
          }),
          mcpCall(
            q + 1,
            "pull_request_read",
            { method: "get", pullNumber: upper.pr },
            mcpGet({ ...layerState(upper), baseRefName: "main" }),
            STACK_REPO(upper),
          ),
          mcpMerge(upper.pr, upper.headRefOid, {
            phase: q + 2,
            method: "squash",
            repo: STACK_REPO(upper),
          }),
        ],
      };
    },
  },
];

export const SCENARIOS = [
  ...PR_SCENARIOS.map((s) => ({ session: "pr", ...s })),
  ...STACK_SCENARIOS,
];

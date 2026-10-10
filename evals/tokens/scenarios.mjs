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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatMutateResult } from "../../src/cli/mutate-formatter.mts";
import { buildLogExcerpt } from "../../src/checks/log-excerpt.mts";
import {
  REPO_ROOT,
  GH_THREADS_CMD,
  GH_VIEW_CMD,
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
  {
    phase,
    via: "bash",
    cmd: GH_VIEW_CMD.replace("view 42", `view ${state.number}`),
    out: ghPrView(state),
  },
  {
    phase,
    via: "bash",
    cmd: GH_THREADS_CMD.replace("number: 42", `number: ${state.number}`),
    out: ghThreads(state),
  },
];

const mcpCall = (phase, tool, args, out) => ({
  phase,
  via: "mcp",
  cmd: `${tool} ${JSON.stringify({ owner: "owner", repo: "repo", ...args })}`,
  out,
});

const mcpObserve = (state, phase = 1) => [
  mcpCall(phase, "pull_request_read", { method: "get", pullNumber: state.number }, mcpGet(state)),
  mcpCall(
    phase,
    "pull_request_read",
    { method: "get_check_runs", pullNumber: state.number },
    mcpCheckRuns(state),
  ),
  mcpCall(
    phase,
    "pull_request_read",
    { method: "get_review_comments", pullNumber: state.number },
    mcpReviewThreads(state),
  ),
  mcpCall(
    phase,
    "pull_request_read",
    { method: "get_reviews", pullNumber: state.number },
    mcpReviews(state),
  ),
  mcpCall(
    phase,
    "pull_request_read",
    { method: "get_comments", pullNumber: state.number },
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

// A GraphQL resolve answers with the thread state only.
const ghResolve = (threadId, phase = 2) => ({
  phase,
  via: "bash",
  cmd: `gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "${threadId}"}) { thread { isResolved } } }'`,
  out: JSON.stringify({ data: { resolveReviewThread: { thread: { isResolved: true } } } }),
});

const mcpResolve = (threadId, phase = 2) =>
  mcpCall(phase, "resolve_review_thread", { threadId }, "review thread resolved successfully");

const mcpMerge = (pullNumber, sha, phase = 2) =>
  mcpCall(
    phase,
    "merge_pull_request",
    { pullNumber, merge_method: "merge" },
    JSON.stringify({ sha, merged: true, message: "Pull Request successfully merged" }),
  );

// --- the real CI failure ----------------------------------------------------

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
  const real = buildLogExcerpt(JOB_LOG);
  const rendered = [`  > ${FAILED_STEP}`, ...real.split("\n").map((l) => `  > ${l}`)].join("\n");
  return withRecordedIds(text.replace(fixtureExcerpt, rendered));
}

// --- scenarios --------------------------------------------------------------

/**
 * One-time cost per session: the skill and the playbooks a session's outputs
 * name for shepherd, on-demand tool schemas for MCP, nothing for gh.
 */
function setupScenario({ id, session, playbooks, mcpTools }) {
  return {
    id,
    session,
    setup: true,
    weight: 1,
    title: "One-time setup",
    note: `Skill + ${playbooks.map((p) => p.replace(".md", "")).join(", ")} playbooks for shepherd; ${mcpTools.length} on-demand tool schemas for MCP; nothing for gh.`,
    arms() {
      const skillDir = join(REPO_ROOT, "plugins", "pr-shepherd", "skills", "pr-shepherd");
      const read = (p) => readFileSync(join(skillDir, p), "utf8");
      const schemas = readJson("mcp-tool-schemas.json").tools;
      return {
        shepherd: [
          {
            phase: 1,
            via: "bash",
            cmd: 'Skill {"skill":"pr-shepherd:pr-shepherd"}',
            out: read("SKILL.md"),
          },
          ...playbooks.map((p) => ({
            phase: 2,
            via: "bash",
            cmd: `Read references/${p}`,
            out: read(`references/${p}`),
          })),
        ],
        gh: [],
        mcp: [
          {
            phase: 1,
            via: "mcp",
            cmd: `ToolSearch {"query":"select:${mcpTools.join(",")}"}`,
            out: mcpTools.map((t) => schemas[t]).join("\n"),
          },
        ],
      };
    },
  };
}

const PR_SCENARIOS = [
  setupScenario({
    id: "session-setup",
    session: "pr",
    playbooks: ["ci-failure-triage.md", "review-mutations.md"],
    mcpTools: [
      "pull_request_read",
      "get_job_logs",
      "add_reply_to_pull_request_comment",
      "resolve_review_thread",
      "update_pull_request",
      "merge_pull_request",
    ],
  }),

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
      const state = failingCheckState();
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
          ...threads.map((_, i) => ghReply(i + 1)),
          ...bots.map((id) => ghResolve(id)),
        ],
        mcp: [
          ...mcpObserve(state),
          ...threads.map((_, i) => mcpReply(i + 1)),
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
          { phase: 2, via: "bash", cmd: "gh pr merge 42 --merge", out: merged },
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
        gh: [...ghObserve(state), { phase: 2, via: "bash", cmd: "gh pr merge 42", out: queued }],
        mcp: [
          ...mcpObserve(state),
          mcpCall(
            2,
            "merge_pull_request",
            { pullNumber: 42, merge_method: "merge" },
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
// review work like fixture 16, any other open layer like the clean fixture 64.
// Where pr-shepherd routes a layer to a one-PR session, that session's first
// tick reads the same fixture, so both arms pay for the same per-layer read.

const STACK_REPO = (layer) => layer.repo ?? "owner/repo";

function layerFixture(layer) {
  if (layer.state !== "OPEN") return null;
  if (layer.reasons?.includes("merge-conflicts")) return "27-fix-code-conflicts";
  if (layer.reasons?.includes("review-work")) return "16-fix-code-review-thread";
  return "64-merge-ready-delay-elapsed";
}

function layerState(layer) {
  return {
    ...fixtureState(layerFixture(layer)),
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
      cmd: `gh pr view ${a.pr} --json ${GH_LIST_FIELDS}`,
      out: ghPrList([a]).slice(1, -1),
    },
  ];
  // Down: stop once a layer's base is the trunk.
  for (let i = anchor - 1, phase = 2; i >= 0; i--, phase++) {
    calls.push({
      phase,
      via: "bash",
      cmd: `gh pr list --head ${layers[i + 1].baseRefName} --state all --json ${GH_LIST_FIELDS}`,
      out: ghPrList([layers[i]]),
    });
    if (layers[i].baseRefName === "main") break;
  }
  // Up: the last call finds nothing above the top layer.
  for (let i = anchor + 1, phase = 2; i <= layers.length; i++, phase++) {
    calls.push({
      phase,
      via: "bash",
      cmd: `gh pr list --base ${layers[i - 1].headRefName} --state all --json ${GH_LIST_FIELDS}`,
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
    );
  const calls = [
    mcpCall(1, "pull_request_read", { method: "get", pullNumber: a.pr }, mcpGet(layerState(a))),
  ];
  for (let i = anchor - 1, phase = 2; i >= 0; i--, phase++) {
    calls.push(list(phase, { head: `owner:${layers[i + 1].baseRefName}` }, [layers[i]]));
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
  setupScenario({
    id: "stack-setup",
    session: "stack",
    playbooks: ["stack-merge.md"],
    mcpTools: ["pull_request_read", "list_pull_requests", "merge_pull_request"],
  }),

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
    note: "Fixture 98. Nothing to do but recheck.",
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
          { phase: p, via: "bash", cmd: `gh pr merge ${lower.pr} --squash`, out: merged(lower) },
          {
            phase: p + 1,
            via: "bash",
            cmd: `gh pr view ${upper.pr} --json baseRefName,mergeStateStatus`,
            out: JSON.stringify({ baseRefName: "main", mergeStateStatus: "CLEAN" }),
          },
          {
            phase: p + 2,
            via: "bash",
            cmd: `gh pr merge ${upper.pr} --squash`,
            out: merged(upper),
          },
        ],
        mcp: [
          ...mcp,
          mcpMerge(lower.pr, lower.headRefOid, q),
          mcpCall(
            q + 1,
            "pull_request_read",
            { method: "get", pullNumber: upper.pr },
            mcpGet({ ...layerState(upper), baseRefName: "main" }),
          ),
          mcpMerge(upper.pr, upper.headRefOid, q + 2),
        ],
      };
    },
  },
];

export const SCENARIOS = [
  ...PR_SCENARIOS.map((s) => ({ session: "pr", ...s })),
  ...STACK_SCENARIOS,
];

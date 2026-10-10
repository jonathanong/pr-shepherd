// Real sessions: today's pr-shepherd runs on jonathanong/pr-shepherd PRs, as
// worked examples next to the synthetic scenarios.
//
//   node evals/tokens/sessions.mjs --extract --transcripts <dir> --logs <dir> \
//     --prdata <dir> --prs 520,521 [--until <ISO>]
//
// reads three local sources and writes data/real-sessions.json:
//
//   transcripts  a Claude Code session, as <dir>/<id> for <id>.jsonl (the
//                coordinator) and <id>/subagents/*.jsonl; --exclude skips
//                subagents by id
//   logs         pr-shepherd's per-worktree debug logs ($PR_SHEPHERD_STATE_DIR/
//                <owner>/<repo>/worktrees/*.md): one entry per GitHub request
//   prdata       one <pr>.json per PR: the PR's threads, comments, reviews and
//                check runs, as fetched once with `gh api graphql` (see README.md)
//
// The JSON holds numbers only: counts, character lengths, seconds since the
// PR's first poll, token usage. No text, IDs, logins, paths or timestamps. The
// bench reads only the JSON, so CI stays offline.
//
// Without --extract, `realSessions()` replays each PR's timeline through the
// bench's per-call models (lib.mjs) for all three arms. The measured
// pr-shepherd numbers calibrate the model; they are never compared with the
// modeled baselines.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ISSUE_FOR } from "./gate.mjs";
import {
  DATA_DIR,
  MODEL,
  READY_MERGEABILITY_REST,
  SHEPHERD_TICK_API,
  apiTotals,
  cost,
  ghPrChecks,
  ghPrView,
  ghThreads,
  ghThreadsCmd,
  ghViewCmd,
  gql,
  mcpCheckRuns,
  mcpComments,
  mcpGet,
  mcpReviewThreads,
  mcpReviews,
  readJson,
  rest,
} from "./lib.mjs";

export const REAL_SESSIONS_FILE = "real-sessions.json";

// --- extraction: debug logs -------------------------------------------------------

const ENTRY =
  /^(## \d{4}-\d\d-\d\dT\S+ — pr-shepherd |### #\d+ (GraphQL|REST) (request|response) — |### Output \()/;
const secs = (iso) => Date.parse(iso) / 1000;
/** A gap this long between two snapshot reads starts a new poll tick. */
const TICK_GAP_SECONDS = 30;
/** An invocation with no log entry for this long has exited. */
const IDLE_SECONDS = 150;
const SNAPSHOT_OPS = new Set(["BatchPr", "PrFingerprint"]);
/** Mutation requests: GitHub reports no query cost for them. */
const MUTATION_OPS = new Set(["BulkApply", "UpdatePrBody"]);

const prOfArgs = (args) => Number(args.match(/(?:\/pull\/|^|\s)(\d{3,})(?=\s|$)/)?.[1]) || null;
const kindOfArgs = (args) =>
  /^apply review\b/.test(args)
    ? "review"
    : /^apply journal\b/.test(args)
      ? "journal"
      : /^(\S+\/pull\/)?\d+\b/.test(args)
        ? "poll"
        : "other";
const idCount = (args, flag) =>
  args
    .match(new RegExp(`--${flag}(?:=|\\s+)(\\S+)`))?.[1]
    .split(",")
    .filter(Boolean).length ?? 0;

function logEntries(text) {
  const entries = [];
  let cur = null;
  for (const line of text.split("\n")) {
    if (ENTRY.test(line)) {
      cur = { head: line, body: [] };
      entries.push(cur);
    } else if (cur) cur.body.push(line);
  }
  return entries;
}

/**
 * Parse one debug log into invocations. Concurrent invocations interleave in
 * one file and each numbers its requests from #1, so a request goes to the open
 * invocation whose next number it is, preferring the PR its variables name.
 * Ambiguous picks are counted in `heuristic`.
 */
function parseLog(text, scope, stats) {
  const invs = [];
  const headPr = new Map();
  const open = (t) => invs.filter((i) => !i.closed && t - i.last <= IDLE_SECONDS);
  const pick = (cands, pr, k) => {
    let c = cands.filter((i) => i.nextK === k);
    if (pr) {
      const same = c.filter((i) => i.pr === pr);
      if (same.length) c = same;
      else {
        const any = cands.filter((i) => i.pr === pr);
        if (any.length) {
          stats.heuristic++;
          c = any;
        }
      }
    }
    if (c.length > 1) stats.heuristic++;
    return c.sort((a, b) => b.last - a.last)[0] ?? null;
  };
  for (const e of logEntries(text)) {
    const body = e.body.join("\n");
    let m;
    if ((m = e.head.match(/^## (\S+) — pr-shepherd (.*)$/))) {
      const t = secs(m[1]);
      invs.push({
        t,
        last: t,
        args: m[2],
        pr: prOfArgs(m[2]),
        kind: kindOfArgs(m[2]),
        nextK: 1,
        pending: new Map(),
        reqs: [],
        outs: [],
      });
    } else if ((m = e.head.match(/^### #(\d+) (GraphQL|REST) request — \S+ (\S+) · (\S+)$/))) {
      const k = Number(m[1]);
      const t = secs(m[4]);
      const op = body.match(/^operation: `(\w+)`/m)?.[1] ?? (m[2] === "REST" ? "rest" : "graphql");
      const vars = body.match(/^variables:\n+```json\n([\s\S]*?)\n```/m)?.[1] ?? "";
      let pr = Number(vars.match(/"pr":\s*(\d+)/)?.[1]) || null;
      if (!pr && m[2] === "REST") pr = Number(m[3].match(/\/pulls\/(\d+)/)?.[1]) || null;
      if (!pr) pr = headPr.get(vars.match(/"headRef":\s*"(\w+)"/)?.[1]) ?? null;
      const inv = pick(open(t), pr, k);
      if (!inv) continue;
      const req = { k, t, op, transport: m[2], cost: null };
      inv.reqs.push(req);
      inv.pending.set(k, req);
      inv.nextK = k + 1;
      inv.last = t;
    } else if ((m = e.head.match(/^### #(\d+) (GraphQL|REST) response — .* · (\S+)$/))) {
      const k = Number(m[1]);
      const t = secs(m[3]);
      const cands = open(t).filter((i) => i.pending.has(k));
      if (cands.length > 1) stats.heuristic++;
      const inv = cands.sort((a, b) => a.pending.get(k).t - b.pending.get(k).t)[0];
      if (!inv) continue;
      const req = inv.pending.get(k);
      inv.pending.delete(k);
      inv.last = t;
      const c = body.match(/^graphql-query: cost (\d+)/m);
      if (c) req.cost = Number(c[1]);
      const head = body.match(/"headRefOid":\s*"(\w+)"/)?.[1];
      if (head && inv.pr) headPr.set(head, inv.pr);
    } else if ((m = e.head.match(/^### Output \((\w+)\) · (\S+)$/))) {
      const t = secs(m[2]);
      const out = body.replace(/^\n*```\n/, "").replace(/\n```\n*$/, "");
      const pr = Number(out.match(/^# PR #(\d+) \[/m)?.[1]) || null;
      // A poll prints a `# PR #N [ACTION]` header; an apply does not.
      const cands = open(t).filter(
        (i) => !i.outs.length && (pr ? i.pr === pr && i.kind === "poll" : i.kind !== "poll"),
      );
      if (cands.length > 1) stats.heuristic++;
      const inv = cands.sort((a, b) => a.t - b.t)[0];
      if (!inv) continue;
      inv.outs.push({
        chars: out.length,
        action: out.match(/^# PR #\d+ \[([A-Z_]+)\]/m)?.[1] ?? null,
      });
      inv.last = t;
      inv.closed = true;
    }
  }
  return invs.filter((i) => scope.has(i.pr) && i.kind !== "other");
}

function tickCount(reqs) {
  const times = reqs.filter((r) => SNAPSHOT_OPS.has(r.op)).map((r) => r.t);
  if (!times.length) return 0;
  return 1 + times.slice(1).filter((t, i) => t - times[i] >= TICK_GAP_SECONDS).length;
}

function invocationRecord(inv, t0) {
  const gqlReqs = inv.reqs.filter((r) => r.transport === "GraphQL");
  const rec = {
    t: Math.round(inv.t - t0),
    seconds: Math.round(inv.last - inv.t),
    kind: inv.kind,
    ...(/--until-terminal/.test(inv.args) && { untilTerminal: true }),
    ...(inv.kind === "poll" && { ticks: tickCount(inv.reqs) }),
    action: inv.outs[0]?.action ?? null,
    outChars: inv.outs[0]?.chars ?? null,
    graphqlRequests: gqlReqs.length,
    graphqlCost: gqlReqs.reduce((s, r) => s + (r.cost ?? 0), 0),
    graphqlMutations: gqlReqs.filter((r) => MUTATION_OPS.has(r.op)).length,
    graphqlNoCost: gqlReqs.filter((r) => r.cost == null && !MUTATION_OPS.has(r.op)).length,
    restRequests: inv.reqs.length - gqlReqs.length,
  };
  if (inv.kind === "review")
    rec.apply = {
      replies: idCount(inv.args, "reply-thread-ids"),
      resolves: idCount(inv.args, "resolve-thread-ids"),
      minimizes: idCount(inv.args, "minimize-comment-ids"),
      dismissals: idCount(inv.args, "dismiss-review-ids"),
    };
  return rec;
}

// --- extraction: transcripts ------------------------------------------------------

const readJsonl = (path) =>
  readFileSync(path, "utf8")
    .split("\n")
    .flatMap((l) => {
      try {
        return l ? [JSON.parse(l)] : [];
      } catch {
        return [];
      }
    });

const resultText = (b) =>
  typeof b.content === "string"
    ? b.content
    : (b.content ?? []).map((x) => (x?.type === "text" ? x.text : "")).join("");

const SHEPHERD_CLI = /(?:^|[\s;&|(])(?:npx (?:--prefix \S+ )?)?pr-shepherd(?=\s)/m;
const GH_PR_STATE =
  /\bgh (?:pr (?:view|checks|ready|edit|comment|review)\b|api\b[^\n|;]*(?:\/pulls\/\d+|graphql[^\n]*pullRequest))/;
const POLL_FILE = /\bp(5\d\d)[a-z]?\.md\b/g;
const ENV_FAILURE =
  /^(?:This (?:session|agent) is isolated in the worktree|.*\b(?:Operation not permitted|Author identity unknown|index\.lock)\b)|pr-shepherd error: Command failed|exit 70\b|Exit code 70\b/m;

/**
 * Classify one tool call. `shepherd`: pr-shepherd invocations, reads of their
 * redirected output, and gh PR-state reads and mutations. `overhead`: calls the
 * environment refused or broke (worktree guard, sandbox, git identity, a poll
 * run outside the repo). Everything else is `common`.
 */
function classify(use, result, bgPrs, scope) {
  const input = use.input ?? {};
  const text =
    use.name === "Bash"
      ? (input.command ?? "")
      : use.name === "Read"
        ? (input.file_path ?? "")
        : JSON.stringify(input);
  const inScope = (n) => scope.has(n);
  const prs = new Set();
  for (const m of text.matchAll(
    /(?:pr-shepherd(?: apply \w+)? (?:\S+\/pull\/)?|\/pull\/|\bpulls\/|number:\s*|gh pr \w+ )(\d{3})\b/g,
  ))
    if (inScope(Number(m[1]))) prs.add(Number(m[1]));
  for (const m of text.matchAll(POLL_FILE)) if (inScope(Number(m[1]))) prs.add(Number(m[1]));
  for (const [id, p] of bgPrs) if (text.includes(id)) p.forEach((n) => prs.add(n));
  const readsPolls =
    (POLL_FILE.test(text) || [...bgPrs.keys()].some((id) => text.includes(id))) && prs.size;
  POLL_FILE.lastIndex = 0;
  const shepherd =
    (use.name === "Bash" && (SHEPHERD_CLI.test(text) || GH_PR_STATE.test(text))) ||
    ((use.name === "Read" || use.name === "Bash" || /Output$/.test(use.name)) && readsPolls);
  if (
    use.name === "Bash" &&
    /^\s*(?:for n in [\d ]+; do )?for n in/.test(text) === false &&
    /\bfor n in ((?:5\d\d ?)+)/.test(text)
  )
    for (const n of text
      .match(/\bfor n in ((?:5\d\d ?)+)/)[1]
      .trim()
      .split(" "))
      if (inScope(Number(n))) prs.add(Number(n));
  const env = ENV_FAILURE.test(result.slice(0, 600));
  return {
    bucket: env ? "overhead" : shepherd ? "shepherd" : "common",
    prs: [...prs],
    isCli: SHEPHERD_CLI.test(text),
  };
}

/**
 * One transcript as a list of API requests (deduplicated by message id: Claude
 * Code splits one response into several events) and their tool calls.
 */
function parseTranscript(path, until) {
  const events = readJsonl(path).filter((e) => !until || !e.timestamp || e.timestamp <= until);
  const calls = [];
  const byId = new Map();
  const results = new Map();
  events.forEach((e, idx) => {
    if (e.type === "assistant" && e.message?.id) {
      let c = byId.get(e.message.id);
      if (!c) {
        c = {
          idx,
          lastIdx: idx,
          t: e.timestamp,
          usage: e.message.usage,
          uses: [],
          thinking: false,
        };
        byId.set(e.message.id, c);
        calls.push(c);
      }
      c.lastIdx = idx;
      const u = e.message.usage;
      if (u)
        c.usage = {
          ...u,
          output_tokens: Math.max(u.output_tokens ?? 0, c.usage?.output_tokens ?? 0),
        };
      for (const b of e.message.content ?? []) {
        if (b?.type === "tool_use") c.uses.push(b);
        if (b?.type === "thinking" || b?.type === "redacted_thinking") c.thinking = true;
      }
    }
    if (e.type === "user" && Array.isArray(e.message?.content))
      for (const b of e.message.content)
        if (b?.type === "tool_result")
          results.set(b.tool_use_id, { text: resultText(b), idx, isError: !!b.is_error });
  });
  return { events, calls, results };
}

const prompt = (u) =>
  (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
/** Real spend of one request, in the bench's input-token equivalents. */
const realIte = (u) =>
  (u.input_tokens ?? 0) +
  MODEL.cacheWriteMultiplier * (u.cache_creation_input_tokens ?? 0) +
  MODEL.cacheReadMultiplier * (u.cache_read_input_tokens ?? 0) +
  MODEL.outputMultiplier * (u.output_tokens ?? 0);

const emptyBucket = () => ({
  ite: 0,
  turns: 0,
  calls: 0,
  resultChars: 0,
  measuredChars: 0,
  resultTokens: 0,
});
/** Per-turn reminders Claude Code adds after every result; the fit's intercept absorbs them. */
const QUIET_ATTACHMENTS = new Set(["total_tokens_reminder", "deferred_tools_record"]);

/**
 * Walk one transcript: attribute each request's spend to the buckets of the
 * calls it emitted, measure each result's real tokens from the next request's
 * prompt growth, and collect clean samples for the chars/token fit.
 */
function walkTranscript(tr, { scope, coordinator, add, samples }) {
  const bgPrs = new Map();
  let current = null; // the PR this transcript last shepherded
  let started = coordinator;
  tr.calls.forEach((c, i) => {
    const next = tr.calls[i + 1];
    const delta =
      next && c.usage && next.usage
        ? prompt(next.usage) - prompt(c.usage) - (c.usage.output_tokens ?? 0)
        : null;
    const items = c.uses.map((u) => {
      const r = tr.results.get(u.id) ?? { text: "", idx: c.lastIdx, isError: false };
      const k = classify(u, r.text, bgPrs, scope);
      const bg = r.text.match(/Command running in background with ID: (\w+)/);
      if (bg && k.prs.length) bgPrs.set(bg[1], k.prs);
      return { u, r, k };
    });
    // Clean sample: one call, one result, nothing else between the requests.
    if (next && items.length === 1 && delta != null) {
      const between = tr.events.slice(c.lastIdx + 1, next.idx);
      const users = between.filter((e) => e.type === "user");
      const clean =
        users.length === 1 &&
        users[0].message.content.length === 1 &&
        items[0].r.idx === tr.events.indexOf(users[0]) &&
        between.every((e) => e.type === "user" || QUIET_ATTACHMENTS.has(e.attachment?.type)) &&
        delta >= 0;
      if (clean)
        samples.push({
          chars: items[0].r.text.length,
          tokens: delta,
          shepherd: items[0].k.bucket === "shepherd" && items[0].k.isCli,
          thinking: c.thinking,
        });
    }
    const chars = items.reduce((s, x) => s + x.r.text.length, 0);
    const ite = c.usage ? realIte(c.usage) : 0;
    if (!items.length) {
      if (started)
        add(coordinator ? null : current, coordinator ? "coordination" : "common", {
          ite,
          turns: 1,
        });
      return;
    }
    for (const { r, k } of items) {
      if (k.isCli && k.prs.length && k.bucket !== "overhead") started = true;
      if (k.bucket === "shepherd" && k.prs.length) current = k.prs.at(-1);
      if (!started) continue;
      const share = 1 / items.length;
      // A prompt that shrank or grew past the results was compacted or took on
      // other input: no measurement.
      const measurable = delta != null && chars && delta >= 0 && delta <= chars + 1000;
      const tokens = measurable ? (delta * r.text.length) / chars : null;
      const bucket = coordinator && k.bucket === "common" ? "coordination" : k.bucket;
      const prs = coordinator
        ? bucket === "coordination"
          ? [null]
          : k.prs.length
            ? k.prs
            : [null]
        : k.bucket === "shepherd" && k.prs.length
          ? k.prs
          : [current];
      for (const pr of prs)
        add(pr, bucket, {
          ite: (ite * share) / prs.length,
          turns: share / prs.length,
          calls: 1 / prs.length,
          resultChars: r.text.length / prs.length,
          ...(tokens != null && {
            measuredChars: r.text.length / prs.length,
            resultTokens: tokens / prs.length,
          }),
          ...(k.isCli && bucket === "shepherd" && { cliResults: 1 / prs.length }),
        });
    }
  });
}

/** Least-squares fit of tokens = intercept + chars / charsPerToken. */
function fit(samples) {
  const n = samples.length;
  if (n < 3) return null;
  const mx = samples.reduce((s, x) => s + x.chars, 0) / n;
  const my = samples.reduce((s, x) => s + x.tokens, 0) / n;
  const sxx = samples.reduce((s, x) => s + (x.chars - mx) ** 2, 0);
  const sxy = samples.reduce((s, x) => s + (x.chars - mx) * (x.tokens - my), 0);
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const ssr = samples.reduce((s, x) => s + (x.tokens - intercept - slope * x.chars) ** 2, 0);
  const sst = samples.reduce((s, x) => s + (x.tokens - my) ** 2, 0);
  const big = samples
    .filter((x) => x.chars >= 2000)
    .map((x) => x.chars / (x.tokens - intercept))
    .filter((r) => r > 0)
    .sort((a, b) => a - b);
  const q = (p) => (big.length ? big[Math.min(big.length - 1, Math.floor(p * big.length))] : null);
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
  return {
    samples: n,
    charsPerToken: r2(1 / slope),
    intercept: Math.round(intercept),
    r2: r2(1 - ssr / sst),
    perSample: { samples: big.length, p10: r2(q(0.1)), p50: r2(q(0.5)), p90: r2(q(0.9)) },
  };
}

// --- extraction: PR content --------------------------------------------------------

/** Per-item sizes and times of one PR's GitHub content. No text survives. */
function prContent(raw, t0) {
  const p = raw.data.repository.pullRequest;
  const rel = (iso) => (iso ? Math.round(secs(iso) - t0) : null);
  return {
    titleChars: p.title.length,
    bodyChars: p.body.length,
    threads: p.reviewThreads.nodes.map((t) => ({
      resolved: t.isResolved,
      outdated: t.isOutdated,
      pathChars: t.path.length,
      hasLine: t.line != null,
      comments: t.comments.nodes.map((c) => ({
        t: rel(c.createdAt),
        chars: c.body.length,
        urlChars: c.url.length,
      })),
    })),
    comments: p.comments.nodes.map((c) => ({
      t: rel(c.createdAt),
      chars: c.body.length,
      urlChars: c.url.length,
      minimized: c.isMinimized,
    })),
    reviews: p.reviews.nodes.map((r) => ({
      t: rel(r.submittedAt),
      state: r.state,
      chars: r.body.length,
    })),
    commits: p.commits.nodes.map(({ commit }) => ({
      t: rel(commit.committedDate),
      checks: commit.checkSuites.nodes.flatMap((s) =>
        s.checkRuns.nodes.map((c) => ({
          nameChars: c.name.length,
          urlChars: c.detailsUrl?.length ?? 0,
          done: rel(c.completedAt),
          ok:
            c.conclusion === "SUCCESS" || c.conclusion === "SKIPPED" || c.conclusion === "NEUTRAL",
        })),
      ),
    })),
  };
}

// --- extraction: main ---------------------------------------------------------------

function extract(opts) {
  const scope = new Set(opts.prs);
  const stats = { heuristic: 0 };
  const logFiles = readdirSync(opts.logs).filter((f) => f.endsWith(".md"));
  const invs = logFiles
    .flatMap((f) => parseLog(readFileSync(join(opts.logs, f), "utf8"), scope, stats))
    .filter((i) => !opts.until || i.t <= secs(opts.until));
  const t0 = Object.fromEntries(
    opts.prs.map((pr) => [pr, Math.min(...invs.filter((i) => i.pr === pr).map((i) => i.t))]),
  );

  const sub = join(opts.transcripts, "subagents");
  const files = [
    { path: `${opts.transcripts}.jsonl`, coordinator: true },
    ...readdirSync(sub)
      .filter((f) => f.endsWith(".jsonl") && !opts.exclude.some((x) => f.includes(x)))
      .map((f) => ({ path: join(sub, f), coordinator: false })),
  ];
  const measured = new Map(opts.prs.map((pr) => [pr, {}]));
  const totals = { agents: {}, coordinator: {} };
  const samples = [];
  let transcripts = 0;
  for (const f of files) {
    const tr = parseTranscript(f.path, opts.until);
    // Only transcripts that ran pr-shepherd on an in-scope PR take part.
    const ran = tr.calls.some((c) =>
      c.uses.some((u) => {
        const k = classify(u, tr.results.get(u.id)?.text ?? "", new Map(), scope);
        return k.isCli && k.prs.length;
      }),
    );
    if (!ran) continue;
    transcripts++;
    const add = (pr, bucket, v) => {
      const sinks = [f.coordinator ? totals.coordinator : totals.agents];
      if (pr && measured.has(pr)) sinks.push(measured.get(pr));
      for (const s of sinks) {
        s[bucket] ??= emptyBucket();
        for (const [key, val] of Object.entries(v)) s[bucket][key] = (s[bucket][key] ?? 0) + val;
      }
    };
    walkTranscript(tr, { scope, coordinator: f.coordinator, add, samples });
  }
  const roundBucket = (b) =>
    Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v * 10) / 10]));
  const roundAll = (o) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, roundBucket(v)]));

  return {
    note: "Generated by `node evals/tokens/sessions.mjs --extract`. Numbers only: seconds are relative to each PR's first poll.",
    sources: { transcripts, debugLogs: logFiles.length, heuristicAttributions: stats.heuristic },
    apiUsageRecorded: false,
    charsPerToken: {
      all: fit(samples),
      shepherd: fit(samples.filter((s) => s.shepherd)),
      noThinking: fit(samples.filter((s) => !s.thinking)),
    },
    buckets: { agents: roundAll(totals.agents), coordinator: roundAll(totals.coordinator) },
    prs: opts.prs.map((pr) => ({
      pr,
      invocations: invs
        .filter((i) => i.pr === pr)
        .sort((a, b) => a.t - b.t)
        .map((i) => invocationRecord(i, t0[pr])),
      measured: roundAll(measured.get(pr)),
      content: prContent(JSON.parse(readFileSync(join(opts.prdata, `${pr}.json`), "utf8")), t0[pr]),
    })),
  };
}

// --- model: replay a real timeline --------------------------------------------------

const fill = (n, c = "x") => c.repeat(Math.max(0, n));
const fakeId = (prefix, n) => `${prefix}${fill(n - prefix.length, "A")}`;

/** The PR's GitHub state at second `t`, rebuilt from sizes with filler text. */
export function stateAt(pr, t) {
  const c = pr.content;
  const commit = c.commits.filter((k) => k.t <= t).at(-1) ?? c.commits[0];
  return {
    repo: "owner/repo",
    number: pr.pr,
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    headRefOid: fill(40, "a"),
    headRefName: "feature",
    baseRefName: "main",
    prTitle: fill(c.titleChars),
    prBody: fill(c.bodyChars),
    reviewThreads: c.threads
      .filter((th) => th.comments[0].t <= t)
      .map((th, i) => ({
        id: fakeId("PRRT_", 22),
        isResolved: th.resolved,
        isOutdated: th.outdated,
        path: fill(th.pathChars, "p"),
        line: th.hasLine ? 10 : null,
        comments: th.comments
          .filter((k) => k.t <= t)
          .map((k, j) => ({
            id: 4238000000 + i * 50 + j,
            author: "reviewer[bot]",
            body: fill(k.chars),
            url: fill(k.urlChars, "u"),
            createdAt: "2026-10-10T18:00:00Z",
          })),
      })),
    comments: c.comments
      .filter((k) => k.t <= t)
      .map((k) => ({
        id: fakeId("IC_", 26),
        author: "reviewer[bot]",
        authorType: "Bot",
        body: fill(k.chars),
        url: fill(k.urlChars, "u"),
        createdAtUnix: 1791000000,
        isMinimized: k.minimized,
      })),
    changesRequestedReviews: [],
    reviewSummaries: [],
    historyReviews: c.reviews
      .filter((r) => r.t <= t)
      .map((r) => ({
        id: fakeId("", 20),
        author: "reviewer[bot]",
        body: fill(r.chars),
        state: r.state,
      })),
    checks: commit.checks.map((k) => ({
      name: fill(k.nameChars, "n"),
      status: k.done != null && k.done <= t ? "COMPLETED" : "IN_PROGRESS",
      conclusion: k.done != null && k.done <= t ? (k.ok ? "SUCCESS" : "FAILURE") : null,
      detailsUrl: fill(k.urlChars, "u"),
    })),
  };
}

const call = (phase, cmd, out, extra = {}) => ({ phase, via: "bash", cmd, out, ...extra });
const mcp = (phase, tool, args, out) => ({
  phase,
  via: "mcp",
  cmd: `${tool} ${JSON.stringify({ owner: "owner", repo: "repo", ...args })}`,
  out,
});
const ghObserve = (s, phase) => [
  call(phase, ghViewCmd(s), ghPrView(s)),
  call(phase, ghThreadsCmd(s), ghThreads(s)),
];
const mcpObserve = (s, phase) =>
  [
    ["get", mcpGet],
    ["get_check_runs", mcpCheckRuns],
    ["get_review_comments", mcpReviewThreads],
    ["get_reviews", mcpReviews],
    ["get_comments", mcpComments],
  ].map(([method, render]) =>
    mcp(phase, "pull_request_read", { method, pullNumber: s.number }, render(s)),
  );

const REPLY = "Fixed in the latest commit.";
const MINIMIZE_OUT = JSON.stringify({
  data: { minimizeComment: { minimizedComment: { isMinimized: true } } },
});
const RESOLVE_OUT = JSON.stringify({
  data: { resolveReviewThread: { thread: { isResolved: true } } },
});

/**
 * One invocation of the real timeline, played three ways. Baselines read the
 * state each pr-shepherd invocation read, wait the ticks it waited, and issue
 * each mutation its `apply review` batched. A journal append has no baseline
 * counterpart, so only pr-shepherd pays for it.
 */
function stepArms(pr, inv) {
  const end = inv.t + inv.seconds;
  const s = stateAt(pr, end);
  const n = pr.pr;
  if (inv.kind === "poll") {
    const waits = Math.max(0, inv.ticks - 1);
    const tickTimes = Array.from({ length: waits }, (_, i) => inv.t + 60 * i);
    return {
      shepherd: [
        call(
          1,
          `pr-shepherd ${n} --interval 60s --timeout 4.5m --quiet-status`,
          fill(inv.outChars ?? 0),
          {
            // A fingerprint miss costs 2 points, each later hit 1 (docs/graphql-usage.md);
            // a READY tick re-reads mergeability over REST.
            api: {
              graphqlPoints: SHEPHERD_TICK_API.graphqlPoints + waits,
              restCore: inv.action === "READY" ? READY_MERGEABILITY_REST : 0,
            },
          },
        ),
      ],
      gh: [
        ...(waits
          ? [
              call(
                1,
                `gh pr checks ${n} -R owner/repo --watch --interval 60`,
                tickTimes.map((t) => ghPrChecks(stateAt(pr, t))).join("\n"),
                {
                  api: gql(waits),
                },
              ),
            ]
          : []),
        ...ghObserve(s, waits ? 2 : 1),
      ],
      mcp: [
        ...tickTimes.flatMap((t, i) => [
          call(2 * i + 1, "sleep 60", ""),
          mcp(
            2 * i + 2,
            "pull_request_read",
            { method: "get_check_runs", pullNumber: n },
            mcpCheckRuns(stateAt(pr, t)),
          ),
        ]),
        ...mcpObserve(s, 2 * waits + 1),
      ],
    };
  }
  if (inv.kind === "journal")
    return {
      shepherd: [
        call(1, `pr-shepherd apply journal ${n} --message "${fill(80)}"`, fill(inv.outChars ?? 0), {
          api: gql(2),
        }),
      ],
      gh: [],
      mcp: [],
    };
  const a = inv.apply;
  const ids = (flag, prefix, len, count) =>
    count ? ` --${flag} ${Array.from({ length: count }, () => fakeId(prefix, len)).join(",")}` : "";
  const mutations = a.replies + a.resolves + a.minimizes + a.dismissals;
  return {
    shepherd: [
      call(
        1,
        `pr-shepherd apply review ${n}${ids("reply-thread-ids", "PRRT_", 22, a.replies)}${ids("resolve-thread-ids", "PRRT_", 22, a.resolves)}${ids("minimize-comment-ids", "IC_", 26, a.minimizes)}${a.replies ? ` --message "${REPLY}"` : ""}`,
        fill(inv.outChars ?? 0),
        { api: gql(1 + Math.ceil(mutations / 10)) },
      ),
    ],
    gh: [
      ...Array.from({ length: a.replies }, (_, i) =>
        call(
          1,
          `gh api --silent -X POST repos/owner/repo/pulls/${n}/comments/${4238000000 + i}/replies -f body='${REPLY}'`,
          "",
        ),
      ),
      ...Array.from({ length: a.resolves }, () =>
        call(
          1,
          `gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "${fakeId("PRRT_", 22)}"}) { thread { isResolved } } }'`,
          RESOLVE_OUT,
        ),
      ),
      ...Array.from({ length: a.minimizes }, () =>
        call(
          1,
          `gh api graphql -f query='mutation { minimizeComment(input: {subjectId: "${fakeId("IC_", 26)}", classifier: RESOLVED}) { minimizedComment { isMinimized } } }'`,
          MINIMIZE_OUT,
        ),
      ),
    ],
    // github-mcp-server has no minimize tool: the MCP arm skips minimizes, which
    // only flatters it.
    mcp: [
      ...Array.from({ length: a.replies }, (_, i) =>
        mcp(
          1,
          "add_reply_to_pull_request_comment",
          { pullNumber: n, commentId: 4238000000 + i, body: REPLY },
          JSON.stringify({ id: "4238000000", url: fill(70, "u") }),
        ),
      ),
      ...Array.from({ length: a.resolves }, () =>
        mcp(
          1,
          "resolve_review_thread",
          { threadID: fakeId("PRRT_", 22) },
          "review thread resolved successfully",
        ),
      ),
    ],
  };
}

const ARMS = ["shepherd", "gh", "mcp"];
const SUM_KEYS = ["calls", "turns", "toolTokens", "ite", "graphqlPoints", "restCore"];

/**
 * The measured characters per token: pr-shepherd's own output, and tool output
 * overall (the baselines' ratio; MCP's own is unmeasured).
 */
export function measuredCharsPerToken(data = readJson(REAL_SESSIONS_FILE)) {
  return {
    shepherd: data.charsPerToken.shepherd.charsPerToken,
    baseline: data.charsPerToken.noThinking.charsPerToken,
  };
}

/** Run `fn` with tokens counted at `cpt` characters each (the model's own when null). */
export function atCharsPerToken(cpt, fn) {
  if (cpt == null) return fn();
  const saved = MODEL.charsPerToken;
  MODEL.charsPerToken = cpt;
  try {
    return fn();
  } finally {
    MODEL.charsPerToken = saved;
  }
}

/**
 * Replay every PR's timeline through the bench models. `cpt` maps an arm to the
 * characters per token its output is counted at.
 */
export function realSessions(data = readJson(REAL_SESSIONS_FILE), cpt = {}) {
  const rows = data.prs.map((pr) => {
    const steps = pr.invocations.filter((i) => i.outChars != null);
    const sum = Object.fromEntries(
      ARMS.map((a) => [a, Object.fromEntries(SUM_KEYS.map((k) => [k, 0]))]),
    );
    for (const inv of steps) {
      const arms = stepArms(pr, inv);
      for (const a of ARMS) {
        if (!arms[a].length) continue;
        const c = atCharsPerToken(cpt[a], () => cost(arms[a]));
        const api = apiTotals(arms[a]);
        for (const k of ["calls", "turns", "toolTokens", "ite"]) sum[a][k] += c[k];
        sum[a].graphqlPoints += api.graphqlPoints;
        sum[a].restCore += api.restCore;
      }
    }
    const polls = steps.filter((i) => i.kind === "poll");
    const m = pr.measured;
    const measuredApi = steps.reduce(
      (t, i) => ({
        graphqlCost: t.graphqlCost + i.graphqlCost,
        graphqlMutations: t.graphqlMutations + i.graphqlMutations,
        restRequests: t.restRequests + i.restRequests,
      }),
      { graphqlCost: 0, graphqlMutations: 0, restRequests: 0 },
    );
    return {
      pr: pr.pr,
      rounds: Math.max(
        1,
        polls.filter((i) => ["READY", "CANCEL", "ESCALATE"].includes(i.action)).length,
      ),
      polls: polls.length,
      applies: steps.length - polls.length,
      ticks: polls.reduce((s, i) => s + i.ticks, 0),
      fixCode: polls.filter((i) => i.action === "FIX_CODE").length,
      threads: pr.content.threads.length,
      comments: pr.content.comments.length,
      measured: {
        shepherd: m.shepherd ?? null,
        common: m.common ?? null,
        overhead: m.overhead ?? null,
        api: measuredApi,
      },
      modeled: sum,
    };
  });
  return { rows, data };
}

/** Every real-session metric on which modeled pr-shepherd costs more than a modeled baseline. */
export function realSessionLosses(rows) {
  const losses = [];
  for (const r of rows)
    for (const b of ["gh", "mcp"])
      for (const k of SUM_KEYS)
        if (r.modeled.shepherd[k] > r.modeled[b][k])
          losses.push({
            where: `real:${r.pr}`,
            metric: k,
            baseline: b,
            ours: r.modeled.shepherd[k],
            theirs: r.modeled[b][k],
          });
  return losses;
}

// --- report section ------------------------------------------------------------------

const num = (n) => Math.round(n).toLocaleString("en-US");
const pct = (ours, base) => {
  const f = base === 0 ? 0 : 1 - ours / base;
  const p = Math.round(f * 100);
  return p === 0 ? "0%" : `${p > 0 ? "−" : "+"}${Math.abs(p)}%`;
};

/** The REPORT.md section, as lines. */
export function realSessionsSection({ rows, data } = realSessions()) {
  const out = [];
  const total = (f) => rows.reduce((s, r) => s + f(r), 0);
  const T = Object.fromEntries(
    ARMS.map((a) => [
      a,
      Object.fromEntries(SUM_KEYS.map((k) => [k, total((r) => r.modeled[a][k])])),
    ]),
  );
  const cpt = data.charsPerToken;
  out.push("## Real sessions", "");
  out.push(
    `Today's pr-shepherd runs on ${rows.length} real PRs (#${rows.map((r) => r.pr).join(", #")}), rebuilt from the agents' transcripts and pr-shepherd's debug logs by \`sessions.mjs --extract\`. Each PR's timeline (every poll with its ticks and action, every \`apply\` with its mutations) is replayed through this report's per-call models for all three arms. The baselines read the PR's real thread, comment, review and check sizes as of each step. pr-shepherd's modeled output is its real output length. The data is [data/real-sessions.json](data/real-sessions.json); it holds numbers only.`,
    "",
  );
  out.push(
    "| PR | rounds | polls (ticks) | FIX_CODE | applies | threads | cost: pr-shepherd / gh / MCP | turns: pr-shepherd / gh / MCP | GraphQL points: pr-shepherd / gh / MCP | REST core: pr-shepherd / gh / MCP |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  const trio = (r, k) => `${num(r.shepherd[k])} / ${num(r.gh[k])} / ${num(r.mcp[k])}`;
  for (const r of rows)
    out.push(
      `| #${r.pr} | ${r.rounds} | ${r.polls} (${r.ticks}) | ${r.fixCode} | ${r.applies} | ${r.threads} | ${trio(r.modeled, "ite")} | ${trio(r.modeled, "turns")} | ${trio(r.modeled, "graphqlPoints")} | ${trio(r.modeled, "restCore")} |`,
    );
  out.push(
    `| **all** | ${total((r) => r.rounds)} | ${total((r) => r.polls)} (${total((r) => r.ticks)}) | ${total((r) => r.fixCode)} | ${total((r) => r.applies)} | ${total((r) => r.threads)} | ${trio(T, "ite")} | ${trio(T, "turns")} | ${trio(T, "graphqlPoints")} | ${trio(T, "restCore")} |`,
    "",
  );
  out.push(
    `Modeled cost of pr-shepherd vs. gh: ${pct(T.shepherd.ite, T.gh.ite)}; vs. MCP: ${pct(T.shepherd.ite, T.mcp.ite)}. Tool tokens: ${pct(T.shepherd.toolTokens, T.gh.toolTokens)} / ${pct(T.shepherd.toolTokens, T.mcp.toolTokens)}.`,
    "",
  );
  const losses = realSessionLosses(rows);
  if (losses.length) {
    out.push(
      "Where modeled pr-shepherd costs more on a real PR. These are not gated: `--check` gates the synthetic sessions, where the same metrics are already pending.",
      "",
    );
    for (const l of losses)
      out.push(
        `- #${l.where.slice(5)} ${l.metric} vs. ${l.baseline === "gh" ? "gh" : "MCP"}: ${num(l.ours)} vs. ${num(l.theirs)} (#${ISSUE_FOR[l.metric]})`,
      );
    out.push("");
  }
  const m = measuredCharsPerToken(data);
  const cptRows = realSessions(data, {
    shepherd: m.shepherd,
    gh: m.baseline,
    mcp: m.baseline,
  }).rows;
  const C = (a, k) => cptRows.reduce((s, r) => s + r.modeled[a][k], 0);
  const baseKeys = new Set(losses.map((l) => `${l.where} ${l.metric} ${l.baseline}`));
  const flips = realSessionLosses(cptRows).filter(
    (l) =>
      (l.metric === "ite" || l.metric === "toolTokens") &&
      !baseKeys.has(`${l.where} ${l.metric} ${l.baseline}`),
  );
  out.push(
    `At the measured characters per token (pr-shepherd ${m.shepherd}, gh and MCP ${m.baseline}; MCP's is unmeasured), modeled cost vs. gh: ${pct(C("shepherd", "ite"), C("gh", "ite"))}; vs. MCP: ${pct(C("shepherd", "ite"), C("mcp", "ite"))}. Tool tokens: ${pct(C("shepherd", "toolTokens"), C("gh", "toolTokens"))} / ${pct(C("shepherd", "toolTokens"), C("mcp", "toolTokens"))}. ${flips.length ? `Verdicts that flip to a loss: ${flips.map((l) => `#${l.where.slice(5)} ${l.metric} vs. ${l.baseline === "gh" ? "gh" : "MCP"} (${num(l.ours)} vs. ${num(l.theirs)})`).join(", ")}.` : "No PR's verdict flips."}`,
    "",
  );

  out.push("### Calibration: measured vs. modeled pr-shepherd", "");
  const sh = rows.map((r) => r.measured.shepherd).filter(Boolean);
  const mTok = sh.reduce((s, b) => s + b.resultTokens, 0);
  const mChars = sh.reduce((s, b) => s + b.measuredChars, 0);
  const api = rows.reduce(
    (t, r) => ({
      cost: t.cost + r.measured.api.graphqlCost,
      mut: t.mut + r.measured.api.graphqlMutations,
      rest: t.rest + r.measured.api.restRequests,
    }),
    { cost: 0, mut: 0, rest: 0 },
  );
  out.push(
    `- **Characters per token.** A result's tokens are the next request's prompt growth, less the calling request's output. Fitted on the ${cpt.noThinking.samples} clean results (one result between two requests, nothing else) whose request had no thinking block: ${cpt.noThinking.charsPerToken} characters per token plus ${cpt.noThinking.intercept} tokens per result (R² ${cpt.noThinking.r2}); per result of 2,000+ characters, median ${cpt.noThinking.perSample.p50}, 10th–90th percentile ${cpt.noThinking.perSample.p10}–${cpt.noThinking.perSample.p90}. pr-shepherd's own output alone: ${cpt.shepherd ? `${cpt.shepherd.charsPerToken} (${cpt.shepherd.samples} results, R² ${cpt.shepherd.r2})` : "too few clean samples"}. With thinking requests included the fit degrades (${cpt.all.samples} results, ${cpt.all.charsPerToken}, R² ${cpt.all.r2}): thinking counts as output but leaves the next prompt. The model assumes ${MODEL.charsPerToken} for every arm and \`fixtures/calibrate\` 4.00, so both undercount real tokens. No session used GitHub MCP, so MCP's JSON ratio is unmeasured.`,
    `- **Context tokens.** The pr-shepherd and PR-state results whose size the next request's prompt growth pins down (${num(mChars)} characters) measured, per-result wrapper included, ${num(mTok)} tokens; the model's ${MODEL.charsPerToken} characters per token gives ${num(mChars / MODEL.charsPerToken)}.`,
    `- **Rate limit.** The debug logs record every request: pr-shepherd spent ${num(api.cost)} GraphQL points on queries, ${num(api.mut)} mutation requests (GitHub reports no cost for these; at 1 point each the total is ${num(api.cost + api.mut)}) and ${num(api.rest)} REST requests. The model charges ${num(T.shepherd.graphqlPoints)} points and ${num(T.shepherd.restCore)} REST requests for the same timeline (GraphQL transport, which every session used). The model's REST requests are one mergeability refresh per READY poll, the rate measured there; the measured remainder falls on CANCEL and FIX_CODE polls, which the model does not charge. No poll recorded \`apiUsage\` (none ran with \`--verbose\`), so these come from the per-request log entries.`,
    `- **Turns.** The agents spent ${num(sh.reduce((s, b) => s + b.turns, 0))} turns on pr-shepherd calls and reads of their output; the model counts ${num(T.shepherd.turns)}, one per invocation.`,
    "",
  );

  out.push("### Where the real tokens went", "");
  const b = data.buckets.agents;
  const allIte = Object.values(b).reduce((s, x) => s + x.ite, 0);
  const row = (name, x) =>
    `| ${name} | ${num(x?.ite ?? 0)} | ${Math.round(((x?.ite ?? 0) / allIte) * 100)}% | ${num(x?.turns ?? 0)} | ${num(x?.resultTokens ?? 0)} |`;
  out.push(
    `Measured on the ${data.sources.transcripts - 1} agent transcripts that shepherded a PR, from each one's first poll. A request's spend goes to the calls it emitted. Real spend weighs Opus usage like the model: cache reads ×${MODEL.cacheReadMultiplier}, cache writes ×${MODEL.cacheWriteMultiplier}, output ×${MODEL.outputMultiplier}.`,
    "",
    "| bucket | spend (ITE) | share | turns | result tokens |",
    "| --- | --- | --- | --- | --- |",
    row("pr-shepherd and PR state", b.shepherd),
    row("code, tests, commits", b.common),
    row("environment overhead", b.overhead),
    "",
  );
  const c = data.buckets.coordinator;
  out.push(
    `The coordinating session spent ${num(c.shepherd?.ite ?? 0)} on pr-shepherd for these PRs, ${num(c.overhead?.ite ?? 0)} on environment overhead and ${num(c.coordination?.ite ?? 0)} on everything else. The sessions ran on Opus; the eval target is Sonnet 5.5 at low effort. Per-output token counts carry over; turns and call counts are model behavior.`,
    "",
  );
  return out;
}

// --- CLI -------------------------------------------------------------------------------

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  if (process.argv.includes("--extract")) {
    const data = extract({
      transcripts: arg("transcripts"),
      logs: arg("logs"),
      prdata: arg("prdata"),
      prs: arg("prs").split(",").map(Number),
      until: arg("until"),
      exclude: (arg("exclude") ?? "").split(",").filter(Boolean),
    });
    writeFileSync(join(DATA_DIR, REAL_SESSIONS_FILE), `${JSON.stringify(data, null, 2)}\n`);
  } else {
    const { rows, data } = realSessions();
    if (process.argv.includes("--json"))
      console.log(
        JSON.stringify(
          { rows, charsPerToken: data.charsPerToken, buckets: data.buckets, sources: data.sources },
          null,
          2,
        ),
      );
    else console.log(realSessionsSection({ rows, data }).join("\n"));
  }
}

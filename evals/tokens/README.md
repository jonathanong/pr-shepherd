# Token-cost benchmark

**How many fewer tokens and turns does an agent spend when it shepherds a PR
with pr-shepherd instead of the gh CLI or the GitHub MCP server?**

The behavior evals one directory up ask whether the agent acts correctly. This
benchmark asks what the work costs. The null hypothesis is that an agent with
only `gh` or only the GitHub MCP server reaches the same state for the same
cost.

Latest numbers: [REPORT.md](REPORT.md). Estimated cost per session
(rewritten by `bench.mjs`; do not edit between the markers):

<!-- bench:headline:start -->

| session | cost vs. gh | cost vs. MCP | turns vs. gh / MCP | tool tokens vs. gh / MCP |
| --- | --- | --- | --- | --- |
| single PR | **−41%** | **−77%** | −19% / −70% | −71% / −89% |
| PR stack | **−43%** | **−62%** | −38% / −58% | −13% / −53% |

GitHub rate limit per session (deterministic, assumed; see the Method section):

| session | GraphQL points: pr-shepherd / gh / MCP | REST core: pr-shepherd / gh / MCP | pr-shepherd on the REST transport | pr-shepherd on cloud REST |
| --- | --- | --- | --- | --- |
| single PR | 42.5 / 36.5 / 12 | 4.8 / 9 / 78.3 | 334 core + 1.5 points | 361.5 core + 1.5 points |
| PR stack | 42 / 27 / 12 | 2 / 6 / 74 | 540 core + 0 points | 570 core + 0 points |

<!-- bench:headline:end -->

The savings are concentrated. Against a frugal gh agent they come from
re-read review history, CI logs, CI and merge-queue waits, and stack merges. Against
the GitHub MCP server they also come from polling and stack discovery, which
MCP has no shortcut for. A single fresh read-and-reply tick against gh is a
wash: between 9% cheaper and 5% dearer. A PR that has already merged costs
15% more to confirm than a state-first gh agent pays. On the GitHub rate limit,
pr-shepherd spends more GraphQL points than gh on a single PR and on a stack,
and far fewer REST requests; against MCP it trades REST requests for GraphQL points. See "Where
pr-shepherd does not save" and "Rate-limit assumptions".

## Run it

```sh
node evals/tokens/bench.mjs          # rewrite REPORT.md
node evals/tokens/bench.mjs --json   # raw numbers
node evals/tokens/bench.mjs --check  # the gate: fail on a loss not in pending-losses.json
```

It is offline and deterministic. CI regenerates REPORT.md next to the eval
cases and fails on any diff. So a snapshot change that moves the numbers has to
commit the new report. CI then runs `--check`. `record.mjs` refreshes the
recorded GitHub data; see its header.

`node evals/analyze.mjs --calibrate <results dir>` fits the measured
without-plugin input tokens per turn of a live eval run against prompt size,
and `--write` stores the result in `data/calibration.json` for this report. No
live calibration is recorded yet. `fixtures/calibrate` is a synthetic results
directory whose input is `3000 + chars / 4` per turn;
`node evals/analyze.mjs --calibrate evals/tokens/fixtures/calibrate` must
print 4.00 characters per token and a 3,000-token intercept. Never run it with
`--write`.

## The gate

The goal is for pr-shepherd to cost less than every baseline on every metric.
`bench.mjs --check` exits nonzero when pr-shepherd is strictly worse than a
baseline on any gated cell that the pending list does not name. A tie is not a
loss.

- **Metrics.** Cost (ITE), tool tokens, turns and tool calls; GraphQL points and
  REST core requests.
- **Baselines.** gh, GitHub MCP and GitHub MCP with eager tools for the token
  metrics. Eager MCP makes the same calls as MCP, so the rate-limit metrics
  compare against gh and MCP.
- **Transports.** The model gives pr-shepherd the same output on every
  transport, so each token metric is one cell. Each rate-limit metric is gated
  three times: for the GraphQL transport, for standard REST (`rest`) and for
  REST through the Claude Code cloud proxy (`cloud`).
- **Scopes.** Each session total, and each scenario on its own, so a loss on
  one step cannot hide in a session average.
- **† steps.** A baseline that cannot finish a step (the † cells) is skipped on
  that scenario: its lower cost covers only part of the work, so it is not a
  win. Session totals keep those rows at the baseline's partial cost, which
  only makes the session gate stricter on pr-shepherd.
- **Setup rows.** A setup row is compared with MCP only. gh has no setup step,
  and eager MCP carries its schemas on every later row instead of loading them.
  pr-shepherd's fixed cost is still gated against both through the session
  totals, which include setup. Setup makes no GitHub call, so it has no
  rate-limit cells.
- **Characters per token.** The token cells are gated a second time with
  pr-shepherd's output counted at its measured characters per token and both
  baselines at the measured ratio for tool output overall (REPORT.md's
  "Sensitivity: measured characters per token"). A cell that is a loss only
  there is listed with a `chars-per-token:` prefix on its scope. The real
  sessions themselves are not gated.

The event arm ("Event arm" below) is informational and not gated. It lives in
its own report section, outside the session and rate-limit totals that
`--check` reads, so it adds no loss and removes none.

Today's losses are listed in [pending-losses.json](pending-losses.json). Each
entry names its scope, metric, transport (rate-limit metrics only) and
baseline, and links the issue that removes it: #528 for tokens and turns, #525
for the rate limit. Entries carry no numbers, so a change in size is not churn;
REPORT.md's Summary prints every loss with its numbers. `--check` also fails
when a listed entry is no longer a loss, or links the wrong issue, so the list
can only shrink. When a fix lands, delete its entries in the same change. The
list is temporary: #524 closes when it is empty.

On a failure, `--check` prints each unlisted loss with its numbers and a
paste-ready entry. Add one only for a regression you accept and track in an
issue.

## Method

Each scenario in [scenarios.mjs](scenarios.mjs) is one step of a PR's or a
stack's life. It is played three ways over **identical GitHub content**:

| arm         | what the agent runs                                                                                                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pr-shepherd | `pr-shepherd <PR> --until-terminal` or `pr-shepherd --stack <PR> --until-terminal`, then the printed `apply review`, merge or `gh stack merge` command when there is one                                                                                             |
| gh CLI      | `gh pr view --json <fields>` plus one `gh api graphql` thread query per PR per tick, then whatever the step needs: `gh run view --log-failed \| tail -n 200`, check-run annotations, `gh api … /replies`, a GraphQL resolve per thread, `gh pr ready`, `gh pr merge` |
| GitHub MCP  | five `pull_request_read` calls per PR per tick (`get`, `get_check_runs`, `get_review_comments`, `get_reviews`, `get_comments`), then `get_job_logs`, `add_reply_…`, `resolve_review_thread`, `update_pull_request`, `merge_pull_request`                             |

On a stack, neither baseline has pr-shepherd's overview:

- **gh** finds the layers with GitHub's native
  `GET /repos/{owner}/{repo}/stacks?pull_request=N` endpoint, in one call.
- **MCP** has no stack tool, so it walks the branch chain from the anchor: one
  `list_pull_requests` call per layer.

Both then read every open layer in full. A native stack cannot merge through
the synchronous merge endpoints. gh therefore calls the asynchronous
`PUT …/pulls/{n}/merge-async` on the top layer, which takes the open downstack
with it, and polls the result. MCP has no asynchronous merge tool.

Each baseline is a competent agent, not a straw man. The gh arm selects
`--json` fields instead of dumping raw REST output, tails the log, and
silences mutation responses with `gh api --silent`. The MCP arm loads tool
schemas on demand. Both arms guard merges with the head SHA they observed
(`--match-head-commit`, `expectedHeadSha`), as pr-shepherd's merge commands
do, and target the fixture's own repository.

Where the content comes from:

- **pr-shepherd output** is the CI-checked snapshot of a `test-cases` fixture.
  For the failing-check scenario, the snapshot's log excerpt is replaced with
  the one pr-shepherd's own `buildLogExcerpt` produces from a real log.
- **Baseline payloads** are rendered from the same fixture's GitHub state, using
  response shapes copied from real `gh` and github-mcp-server responses.
- **Stack layers** take their content from the single-PR fixture matching their
  row (conflicting, review work, or clean). Where pr-shepherd routes a layer to
  a one-PR session, that session's first tick reads the same fixture, so both
  arms pay for each layer.
- **Real data** (`data/`, all public):
  - A 194 KB failed Actions log from this repository.
  - The review history of [jonathanong/pr-shepherd#505](https://github.com/jonathanong/pr-shepherd/pull/505):
    three bot reviewers, two resolved threads and 28 KB of bot comments.
  - github-mcp-server's own tool-definition snapshots.

Each scenario reports four numbers per arm:

- **tool calls**.
- **turns**: one turn per round of parallel calls. This is generous to the
  baselines, which can fire all their reads at once.
- **tool tokens**: commands plus results, after the host's output caps.
- **cost (ITE)**: input-token equivalents. Every turn re-reads the context from
  cache (×0.1), writes new tokens to cache (×1.25), and pays output price (×5)
  for the commands it emits. The base context is 30k tokens. Turns cost money
  even when they fetch little; this column captures that. The request that
  reads one step's last results also emits the next step's first call, so it
  is charged once, to the next step.

Setup loads lazily, in scenario order, as an agent would:

- **pr-shepherd:** the skill up front, then each playbook when an output first
  names it.
- **MCP:** each tool's schema, through ToolSearch, when the arm first calls the
  tool.

Each load is its own turn. Whatever has loaded stays in context on every later
request in the session.

The pr-shepherd arm follows the skill and runs `--until-terminal`. That poll
blocks through WAIT ticks, printing one stderr line per tick, and keeps going
through MARK_READY. The blocking call's final result is the next scenario's
tick, so a wait adds only its stderr lines, and marking a draft ready adds
nothing. gh's `gh pr checks --watch` returns only the checks table, so gh still
needs its own read for the next step.

The report has one total for a PR session and one for a stack session. Each
total adds its own setup. The stack session counts only stack-level ticks; the
one-PR sessions it routes are PR sessions. The "per tick" figures are weighted
by scenario frequency and baseline cost, excluding setup.

A † in the report marks a baseline that cannot finish the step with its tools
(the GitHub MCP server cannot read check annotations, enqueue a PR, see a PR's
merge-queue membership, or merge a native stack). Its cost
then covers only what it could do, so the saving shown understates the gap. Every knob is in `MODEL` in [lib.mjs](lib.mjs) and is
printed at the bottom of the report.

### Baseline strategy

A baseline can fire all its reads in one turn (**parallel**) or read the PR's
state first and the rest in the next turn, stopping when the PR is terminal
(**state first**). Each baseline takes the cheaper strategy for every PR step,
and the report prints both strategies' session costs. State first only wins on
`merged`, where gh stops after one `gh pr view --json state,isDraft` and MCP
after one `pull_request_read get`. Stack steps stay parallel.

### Rate-limit assumptions

Beside tokens, the report counts how much of the GitHub primary rate limit each
arm spends: GraphQL points and REST core requests, which are separate buckets.
**It is deterministic and assumed.** No GitHub call is made, and the numbers
are as good as these assumptions:

- **pr-shepherd, GraphQL transport** (`docs/graphql-usage.md`):
  - a cold one-PR tick is 1 point (`BatchPr`), and each unchanged wait poll is
    a 1-point fingerprint hit; the first changed tick after a wait reads the
    fingerprint, misses and reads `BatchPr`, so it is 2 (the wait scenario
    carries that extra point);
  - a stack tick is 1 topology point plus `max(1, round(0.52 × layers))`;
  - a one-PR tick on a non-root native-stack layer (the sessions `stack-work`
    routes) also loads the trunk's required contexts (`RefRules`) and the
    stack topology (`PollStackTopology`), 3 points in all;
  - `apply review` reads the head SHA for `--require-sha` (1 point), then
    spends one thread read plus one point per chunk of 10 mutations, and one
    `ReplyRecoveryEvidence` read per chunk that carries replies;
  - a tick that renders a failing job's log excerpt also lists the run's jobs
    and reads the job log, two REST requests on either transport;
  - `BatchPr`'s supplements are charged only where the scenario's state
    triggers them. `CheckRunAnnotationsBatch` runs on a full tick whose
    completed check runs report annotations that are not in the 1-hour
    per-check-run cache: 1 point per 20 check runs. `failing-check` (the
    recorded job carries an exit-code annotation) and `check-annotations` are
    charged it. `BaseBehind` (1 point, on every tick including fingerprint
    hits) runs while a non-stack PR's base has a required status context that
    no check has reported yet; no scenario has that state, so none is charged;
  - the tick after an elapsed ready delay (`merge`, `merge-queue`) selects the
    READY-receipt summary sibling, 2 points instead of 1;
  - the guarded merge is 2 points (lookup and mutation);
  - the poll tick that marks a draft ready is a changed tick after a wait plus
    the 1-point mutation, 3 points;
  - a READY tick re-reads the PR's mergeability with one REST request before
    acting, on every transport (`refreshReadyMergeability`). The real sessions
    measured exactly one on each of their 21 READY polls. It is charged to
    `mark-ready`, `merge` and `merge-queue`.
- **pr-shepherd, REST transport.** This is standard REST (an explicit
  `--transport rest`, or `auto` after a GraphQL fallback outside the Claude
  Code cloud). REST has no fingerprint shortcut, so a poll is a full read.
  From `src/github/rest-stack-summary-sharing.test.mts`, a 10-layer stack tick
  is 126 requests, which this models as 6 shared plus 12 per layer. A routed
  non-root layer's one-PR tick adds the stack read, the trunk's protection,
  rules and compare, and the stack topology (the stack list and read twice,
  each layer's pull and the viewer). A one-PR
  tick is 14 requests, counted at the HTTP boundary of the REST iterate test
  routes and measured live (below); none is conditional, so none is a free 304. The `failing-check` and
  `check-annotations` ticks add one annotation read per annotated check run.
  `apply review` reads the pull for `--require-sha`; a thread resolve has no
  standard REST route, so it then spends, when it has replies, a 4-request
  transcript read (pull comments, issue comments, reviews and the viewer) and
  three requests per reply (`/user` and the pull comments, read so a lost
  response can be recovered, then the POST). Ready-for-review has no standard REST route either: the
  `mark-ready` tick is its 14-request read plus the mergeability refresh (15
  requests), and it escalates as
  transport-unsupported instead of marking the PR ready. The live check below
  had no failing check, so neither the job/log reads nor the annotation reads
  were measured.
- **pr-shepherd, cloud REST.** The same REST path through the Claude Code
  cloud proxy (`CLAUDE_CODE_REMOTE=true`, where `auto` starts on REST). Each
  PR snapshot also reads `/ccr/review_threads`, so a one-PR tick is 15
  requests and a stack tick is 6 shared plus 13 per layer. `apply review`'s
  transcript read is 5 requests, and each thread resolve is one CCR POST
  (`src/comments/rest-review-mutations.mts`). The `mark-ready` tick marks the
  PR ready with one more CCR POST. Replies and a routed stack layer's extra
  reads cost what they do on standard REST. The live check below ran outside the cloud,
  so this arm is the measured 14-request tick plus the proxy read.
- **gh:** `gh pr view`, the thread query and each `gh pr checks` refresh are
  one point; `--watch` is one point on start plus one per refresh; `gh pr ready` and
  `gh pr merge` are two (lookup and mutation); `gh run view --log-failed` is
  two REST requests; replies, annotations, the stacks lookup and the
  merge-async calls are one REST request each; a thread resolve is one point.
- **GitHub MCP:** a mapping from tool to cost in
  [data/mcp-api-map.json](data/mcp-api-map.json), read from each tool's
  handler at the pinned commit (the one `data/mcp-tool-schemas.json` records).
  Every entry names its `source` file and function and the `calls` it makes.
  It assumes the server's default configuration: lockdown mode and the IFC
  labels flag are off, so no extra visibility or author lookups run. A job
  log's body comes from a signed redirect URL and is not a core API request.
  Reading the source changed one entry: `update_pull_request` with `draft`
  is two GraphQL points (an `isDraft` query and the mutation) plus one REST
  `PullRequests.Get`, not one point and one request.
  When `record.mjs` moves the pin to another commit it sets `verified` to
  `false`, and the report says so, until someone re-reads each `source`
  handler and sets it back. It cannot check the costs by itself.

**Live cross-check.** [data/api-usage-check.json](data/api-usage-check.json)
records `npx pr-shepherd iterate 522 --verbose --format=json` run twice per
transport from a fresh `PR_SHEPHERD_STATE_DIR`. A temporary untracked
`.pr-shepherdrc.yml` (`iterate.minimizeComments: none`,
`actions.autoMinimizeSuppressed: false`, `actions.autoMarkReady: false`) and a
PR with no unresolved outdated threads kept the runs read-only. A one-shot
`iterate` never uses the fingerprint cache (only the poll path does), so every
tick is a full read and the check does not measure fingerprint hits or misses.
Each first tick also read the annotations of three first-look check runs, so
its model adds `annotationBatchApi(3)`. GraphQL took 2 points on the first tick
(`BatchPr` plus one `CheckRunAnnotationsBatch` chunk) and 1 on the second, with
no REST. REST took 17 requests on the first tick (14 plus three annotation
reads) and 14 on the second, all `200`. All four match the model. REPORT.md
prints the table. Re-run it by hand when the transports change; CI makes no
GitHub calls.

A call whose cost is not derivable from its command (a stack tick, a poll
tail, a hidden mutation) carries an explicit `api`; every other call is
classified from its command, and an unrecognized command throws.

### Event arm

The event arm models a local (non-cloud) session that waits without polling
the full snapshot. A blocking `pr-shepherd wait` runs in the background and
wakes the agent only on a relevant change or at `nextCheck`. That command does
not exist yet; this is a costing for the webhook/event source brainstorm,
#544. It is not the cloud event mode (`poll.mode`,
[docs/cloud.md](../../docs/cloud.md)), where the host wakes the session on PR
events and Shepherd runs one tick per wake; this arm models a local session
whose wait detects changes itself. The arm is informational: it is not gated (see "The gate") and has its
own REPORT.md section and Summary lines. `eventArm` in
[scenarios.mjs](scenarios.mjs) derives it from the pr-shepherd arm, step by
step, so it reuses that arm's outputs and its per-tick GraphQL costs. Each
scenario's `event` spec says how the step wakes and how many detector reads
change during its wait.

Every assumption below is **assumed**, not measured. They are listed roughly
by how far they move the result.

- **A wake costs one more request than the blocking poll (assumed).** The
  agent starts `wait` in the background, reads the host's acknowledgement in a
  request of its own, and ends its turn. The wake notification then carries the
  tick's output (assumed; a host that only signals completion would add a
  Read call and another turn per wake). That extra request is +8 turns in a PR
  session and +4 on a stack, and it is most of the arm's extra ITE. If the
  agent started `wait` in the same turn as the step's last calls, its turns
  would match the poll arm's.
- **Reconcile (assumed).** A full snapshot runs `RECONCILE_MINUTES` (15)
  after the last one and wakes the agent with a WAIT tick, because webhooks and
  detectors can miss things. Every snapshot restarts the timer. No modeled wait
  is 15 minutes long, so the sessions have no reconcile; an idle hour has 4.
- **Detectors (assumed).** Every `DETECTOR_POLL_SECONDS` (60, the poll arm's
  interval, so latency is unchanged), the wait sends one conditional
  `If-None-Match` request to each of `EVENT_DETECTORS`: the pull, the head
  commit's check runs, reviews, issue comments and review comments. ETags
  persist across `wait` runs. A 304 costs no primary rate limit (GitHub REST
  docs, conditional requests) but still costs a round trip; a 200 is one REST
  core request. Each changed tick then runs one full snapshot at the poll
  arm's GraphQL tick cost. The wait reads no fingerprint, so where the poll
  pays a fingerprint miss after a skipped wait (`ci-wait`, `mark-ready`), the
  event arm does not. The stack arm's detectors are per open layer. CI that
  reports through the legacy Commit Status API (`commits/{head}/statuses`,
  which the snapshot reads) is not watched; such a repository would need a
  sixth detector, which costs nothing while it answers 304, or it waits for
  the reconcile.
- **Which reads change (assumed, per scenario).**
  - After a push, the pull is a 200 (new head), and mergeability, which GitHub
    computes asynchronously, needs one follow-up pull read (another 200).
  - While CI runs, the new head's check runs are a fresh URL (one initial
    200), then a 200 on every round (jobs start and finish). The wait reads
    the statuses from that body and wakes only when CI settles, so `ci-wait`
    spends 2 + 1 + 6 REST requests and no GraphQL instead of 7 fingerprint
    points.
  - A review thread changes reviews and review comments; the agent's reply
    changes review comments again (the wait recognizes its own echo without a
    snapshot). A resolve changes no REST detector. A merge, a conflict or a
    mark-ready changes the pull; an external failing check changes check runs.
  - On a stack, `stack-work` changes one read per layer it routes, and the
    merge-queue wait sees each layer's pull turn merged, then runs one stack
    snapshot instead of one per 120s tick.
- **Steps the poll runs in process stay in process (assumed).** The wait
  marks a draft ready without waking the agent, as `--until-terminal` does
  (a snapshot, the mutation, and the pull's echo), and the ready delay is a
  `nextCheck` timer wake with the same receipt tick. Steps the agent runs
  itself (`apply review`, merges, log reads) cost what they cost in the poll
  arm.
- **Idle hour (assumed).** The report also prices an hour where nothing
  changes: the poll arm's blocking `--until-terminal` call (60 fingerprint
  points, no turn), which is what the skill runs and the comparison that
  counts; the legacy bounded CLI mode, a `--timeout 4.5m` poll called again
  each time it returns (one turn each), which the skill no longer uses and is
  shown only for reference; and the event arm (4 reconcile wakes of two requests each, 300 conditional
  requests that all answer 304). The poll declines a sleep that does not fit
  in its timeout (`poll.mts`), so with the 60s interval each bounded call runs
  5 ticks and returns after about 240s: 15 calls and 75 GraphQL points an
  hour. Each call's output is its default (non-quiet) progress line for each of
  its 4 sleeping ticks plus the final WAIT tick, as in `ci-wait`.
- **Hosted webhook proxy (hypothetical).** A sensitivity row, not a design:
  the same agent wakes and tokens, no detector polls, and every pr-shepherd
  snapshot (change ticks, reconciles, and their log and annotation reads)
  fetched by the proxy with its own credentials, so it spends none of the
  user's token. The agent's mutations, merges, `apply review` reads and its own
  `gh` reads still count.

Open PR #542 lowers several GraphQL per-tick costs. This arm uses the costs
on `main`, so its numbers, and the poll arm's, shift when #542 lands.

### Fixed costs a skill triggers

`setupScenario` loads each playbook a shepherd output names with
`Playbook: "<name>"`. A step whose skill text, rather than its output, sends the
agent to a playbook lists it in `skillTriggers: ["<name>"]` on the scenario. It
is loaded at that scenario's share like a named one, and an unknown name
throws. No scenario uses it yet.

### Weights

`weight` is how often a step happens in one typical session.

PR session:

- two CI runs to wait out (the first push and one fix);
- one failing check;
- one review-summary first look;
- two review threads (one before and one after a review round);
- one bot-thread round, half a multi-category tick, half a conflict, and a
  quarter of a check-annotation failure;
- one mark-ready and one merged PR;
- half a merge and a quarter of a merge-queue enqueue (not every session runs
  with `--merge`).

Stack session:

- two ticks that route work across a six-layer stack;
- one merge-queue wait;
- one stack merge.

These are assumptions, not measurements. See "Next steps".

### Real sessions

REPORT.md's "Real sessions" section replays the pr-shepherd runs that
shepherded eight of this repository's PRs. `sessions.mjs --extract` reads the
agents' Claude Code transcripts, pr-shepherd's debug logs and one `gh api
graphql` dump per PR (threads, comments, reviews, check runs). It writes
`data/real-sessions.json`: counts, character lengths, relative seconds and
token usage, never text, IDs or paths. The bench reads only that file.

- **Timeline.** Each poll (its action, and its ticks: snapshot reads at least
  30 s apart) and each `apply` (its mutation counts) is one step. Both
  baselines read the state that step read and issue the mutations it batched.
  Their payloads are filler of the PR's real item sizes as of that step. The
  PR dumps hold only the statuses at dump time, so items turn resolved,
  minimized or dismissed as the timeline's applies reach them, earliest first:
  items the dump shows with that status, then (for applies after the dump)
  items it does not. An `apply` that sent no mutation failed before applying
  anything: pr-shepherd pays for the attempt, and the baselines repeat
  nothing. Replayed commands keep the real ones' `--until-terminal` and
  `--require-sha`. Checks from
  before the first recorded commit are unknown and replayed as none. A wait
  with a check pending is a `gh pr checks --watch` refresh for gh; a wait with
  none pending (pr-shepherd's debounce) is a plain sleep, since `--watch`
  would return at once. Consecutive waits of one kind form one call, in
  timeline order. The baselines' PR body leaves out the Shepherd
  Journal block, which only pr-shepherd writes. Text sizes are their
  JSON-escaped lengths, since the baselines read them as JSON, and each
  thread comment's filler URL keeps its numeric `#discussion_r` anchor for
  MCP's reply tool.
- **pr-shepherd's charge.** A poll pays one point per tick, one more per
  later tick whose fingerprint missed (the logs show which did), and on a
  READY or ready-delay CANCEL tick one REST mergeability refresh; the
  ready-delay CANCEL also reads on the two-point receipt query. An `apply
review` pays the head-SHA read, and its replayed command carries a 40-character
  SHA, when it passed `--require-sha`, and, with
  replies, the thread-transcript read and one recovery read per 10 replies,
  plus one request per 10 mutations. Requests, costs and output past
  `--until` close an invocation but add nothing to its record.
- **Attribution.** Concurrent invocations interleave in one debug log; a
  request, response or output that matches more than one open invocation is
  assigned by heuristic, and the report prints how many were (up to
  `--until`).
- **GraphQL points by query.** Each invocation records requests and logged
  cost per GraphQL operation. The report groups them (fingerprint, BatchPr and
  its supplements, `apply review` reads, and so on) and sets the tick queries
  against the model's per-poll charge.
- **Calibration, not gating.** Measured pr-shepherd numbers (result tokens,
  GraphQL cost per request, REST requests, turns) calibrate the modeled
  pr-shepherd arm. They are never compared with the modeled baselines, and
  no real-session row is gated. One measurement does reach `--check`: the
  characters per token that `real-sessions.json` records re-score every
  synthetic step, and verdicts that flip at those ratios are gated
  (`chars-per-token:` entries in `pending-losses.json`). So re-extracting
  the sessions can add or remove gated losses. A step where pr-shepherd or a
  baseline gains a truncated or rejected call at those ratios is left out of
  the comparison with that baseline only, since the arm no longer finishes
  it. Only the ratio changes: the fits' per-result intercept is not charged,
  as the model charges none. Leaving it out favors the baselines only where
  they make at least as many calls as pr-shepherd; setup and unsupported
  steps can have pr-shepherd making more, so the report claims it only when
  every step passes that check.
- **No CI logs for the baselines.** A FIX_CODE poll that ended with a failed
  check would send a baseline to the failed job's log, but the data has no
  real log sizes, so the replay gives gh and MCP no log call. The report
  counts those polls.
- **Buckets.** Each request's real spend goes to the calls it emitted:
  pr-shepherd and PR-state calls, environment overhead (worktree guard,
  sandbox, git identity, polls run outside the repository), or the code, test
  and commit work every arm would do.
- **Model.** The sessions ran on Opus; the eval target is Sonnet. Per-output
  token counts carry over; turn and call counts are model behavior.

## Where the savings come from

- **History is re-read every tick.** After one review round, `gh pr view
--json comments,reviews` and the MCP readers return every bot summary and
  resolved thread again: about 8.5k tokens on #505. pr-shepherd's seen markers
  surface each item once. This is most of the gap in the `-with-history` and
  `mark-ready` scenarios. A state-first gh agent skips the re-read on a merged
  PR, so `merged` is not one of them.
- **Logs are excerpted.** On the real log, pr-shepherd's excerpt is about 1.1k
  tokens. `gh … --log-failed | tail -n 200` is about 7k. MCP's default
  500-line tail is about 11k, and none of it is the failure: on this log the
  last 500 lines are all Codecov upload and post-job steps. The MCP arm asks
  again for 1,000 lines, which is over the host's 25k-token MCP cap and comes
  back as an error, then retries with 900.
- **Polling happens inside the CLI.** One blocking `--until-terminal` call
  replaces a minute-by-minute MCP re-check, and it carries on through
  MARK_READY. It returns the next step's result itself, so a wait costs no
  extra turn. gh's `gh pr checks --watch` also blocks, but gh still has to read
  the PR once it returns, and it has nothing for a merge queue, so it re-checks
  queue state itself.
- **Stacks need one overview.** MCP needs one turn per layer to find the stack.
  gh finds it in one call, but merging a native stack still costs it an
  asynchronous merge plus a poll, where pr-shepherd prints one
  `gh stack merge`.

## Fixed vs. variable cost

The report splits each session's cost in two:

- **Fixed:** setup, plus carrying it in context on every later request.
  - pr-shepherd: the skill and the playbooks the outputs name.
  - MCP: the tool schemas.
  - gh: nothing.
- **Variable:** the steps themselves, costed with nothing carried.

| session | pr-shepherd fixed share | variable tokens vs. gh | variable cost vs. gh |
| ------- | ----------------------- | ---------------------- | -------------------- |
| PR      | 25% of its cost         | −73%                   | −49%                 |
| stack   | 32% of its cost         | −2%                    | −49%                 |

The stack session's "+42% tool tokens vs. gh" is all fixed cost. pr-shepherd
loads about 2.2k tokens of skill and playbooks, and gh loads nothing. On
variable tokens alone pr-shepherd reads 2% less than gh.

Within the variable cost, `stack-work` is where pr-shepherd reads more than gh:
2,254 tokens against 1,598.

- **Overview:** pr-shepherd's stack overview is about 600 tokens. gh's native
  stacks call, projected with `--jq`, is about 260.
- **Routed layers:** each layer pr-shepherd routes gets its own one-PR tick of
  about 450 tokens. About 250 of those are the fixed `## Instructions` block and
  60 the post-fix commands. gh's per-layer reads are 100–250 tokens, because the
  fixture layers each carry a single short thread.

So on small layers, the per-output instruction boilerplate outweighs the
content. pr-shepherd still costs 11% less on that row, because its commands are
shorter (output tokens cost 5×). It pulls ahead once layers carry real review
history, which gh re-reads and pr-shepherd shows once.

The levers, in order of size:

1. Trim the invariant instruction text that every routed one-PR tick repeats.
2. Shrink SKILL.md, which is most of the fixed cost.
3. Tighten the stack overview.

## Where pr-shepherd does not save

REPORT.md's Summary lists every gated loss with its numbers; this section
explains the main ones.

- **Setup.** The skill and the playbooks a session's outputs name cost about
  2.2–3.0k tokens, loaded over one to three turns. Those tokens then ride along
  on every later request: a quarter to a third of pr-shepherd's session cost.
  gh needs nothing.
- **Fresh single-step ticks against gh.** A frugal gh agent selects `--json`
  fields and replies with `gh api --silent`. On these steps pr-shepherd lands
  between 9% cheaper and 5% dearer than gh, because its Markdown output and
  carried skill context offset the saved reads. Against MCP's five-reader
  observe, pr-shepherd still saves 3–18% on each, and 67% on `multi-category`,
  where MCP's log retries dominate. The steps:
  - `bot-review-summary`, `review-thread`, `multi-category` and `bot-threads`;
  - `conflicts`, `merge` and `merge-queue`.
- **Confirming a merged PR.** A state-first gh agent runs one
  `gh pr view --json state,isDraft` and stops, about 24 tokens. pr-shepherd's
  tick is 133 tokens and carries the skill, so `merged` costs 15% more than
  gh and 18% less than MCP.
- **Stack token volume.** Each routed layer's first tick prints its own
  instructions. In the stack session pr-shepherd reads 42% more tool tokens than
  gh's terse per-layer reads, and routing work across the six-layer stack is
  nearly even with gh (−11%). The session still costs 25% less, because
  pr-shepherd takes 10 turns where gh takes 13.

## What this does not measure

- **Real token counts.** 3.5 characters per token is applied to every arm. The
  real sessions in REPORT.md measured about 2.5 characters per token across all
  tool results and about 2.2 for pr-shepherd's own output, so the model
  undercounts every arm, pr-shepherd's most. REPORT.md's "Sensitivity: measured
  characters per token" re-scores every step at those ratios and lists the
  verdicts that flip. None of those sessions used GitHub MCP, so its ratio is
  unmeasured and taken as the overall one.
- **Reasoning tokens.** The baselines must also classify raw state (Is this
  thread already handled? Is this failure a flake?), work pr-shepherd's output
  has already done. This benchmark counts none of it.
- **Wrong turns.** The behavior evals show the baselines blocking on
  `gh run watch`, stopping early or rerunning real failures. Each of those costs
  more than any row here.
- **Agent work.** Code edits, commits and pushes are the same in every arm and
  are excluded.
- **Real rate-limit cost.** The gh numbers are assumptions. The MCP mapping is
  read from source, and pr-shepherd's one-PR tick is checked against one live
  PR. pr-shepherd's whole-session spend is measured only for the real
  sessions, from its debug logs; the baselines' is never measured. GraphQL point cost also depends on
  query shape and node counts, which a flat 1 or 2 points per call ignores.
  REST conditional requests (ETag/304) are modeled only in the informational
  event arm; the gated arms make none. Real sessions run the
  annotation supplement more often than the bench: GitHub currently adds an
  `ubuntu-latest` migration notice annotation to Actions jobs on that runner,
  so each new set of completed check runs costs a point.
- **What the MCP stack walk cannot see.** `stack-work` has MCP stop at the
  first layer whose base is the trunk, so a merged parent below a trunk-based
  layer is never read. That is cheaper for MCP and also a blind spot: it
  cannot learn that the parent merged, which pr-shepherd's overview reports
  and which can change what the agent does. The baseline's cost here is a
  lower bound.

## Next steps

1. **Live A/B.** Run the same scenarios end to end with
   `claude -p --output-format stream-json`, with and without the plugin,
   against throwaway PRs on a sandbox repository. Read the real `usage` blocks
   and turn counts, then calibrate this model against them.
2. **Mined weights.** Replace the assumed weights with the per-action tick
   distribution from real transcripts, the same corpus behind cases 01–12.
3. **Exact tokens.** Count each payload with the Messages API `count_tokens`
   endpoint instead of the character ratio.

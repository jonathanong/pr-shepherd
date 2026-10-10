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
| single PR | **−33%** | **−74%** | −14% / −67% | −63% / −85% |
| PR stack | **−25%** | **−50%** | −23% / −47% | +42% / −23% |

GitHub rate limit per session (deterministic, assumed; see the Method section):

| session | GraphQL points: pr-shepherd / gh / MCP | REST core: pr-shepherd / gh / MCP | pr-shepherd on the REST transport |
| --- | --- | --- | --- |
| single PR | 42.5 / 36.5 / 11 | 3 / 9 / 78.3 | 332.3 core + 1.5 points |
| PR stack | 42 / 27 / 12 | 2 / 6 / 74 | 540 core + 0 points |

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
```

It is offline and deterministic. CI regenerates REPORT.md next to the eval
cases and fails on any diff. So a snapshot change that moves the numbers has to
commit the new report. `record.mjs` refreshes the recorded GitHub data; see its
header.

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
    the 1-point mutation, 3 points.
- **pr-shepherd, REST transport.** This is standard REST (an explicit
  `--transport rest`, or `auto` after a GraphQL fallback outside the Claude
  Code cloud). The cloud variant, where each snapshot also reads the CCR proxy,
  comes in #533. REST has no fingerprint shortcut, so a poll is a full read.
  From `src/github/rest-stack-summary-sharing.test.mts`, a 10-layer stack tick
  is 126 requests, which this models as 6 shared plus 12 per layer. A routed
  non-root layer's one-PR tick adds the stack read, the trunk's protection,
  rules and compare, and the stack topology (the stack list and read twice,
  each layer's pull and the viewer). A one-PR
  tick is 14 requests, counted at the HTTP boundary of the REST iterate test
  routes; none is conditional, so none is a free 304. The `failing-check` and
  `check-annotations` ticks add one annotation read per annotated check run.
  `apply review` reads the pull for `--require-sha`; a thread resolve has no
  standard REST route, so it then spends, when it has replies, a 4-request
  transcript read (pull comments, issue comments, reviews and the viewer) and
  three requests per reply (`/user` and the pull comments, read so a lost
  response can be recovered, then the POST). Ready-for-review has no standard REST route either: the
  `mark-ready` tick is its 14-request read, and it escalates as
  transport-unsupported instead of marking the PR ready.
- **gh:** `gh pr view`, the thread query and each `gh pr checks` refresh are
  one point; `--watch` is one point on start plus one per refresh; `gh pr ready` and
  `gh pr merge` are two (lookup and mutation); `gh run view --log-failed` is
  two REST requests; replies, annotations, the stacks lookup and the
  merge-async calls are one REST request each; a thread resolve is one point.
- **GitHub MCP:** a mapping from tool to cost in
  [data/mcp-api-map.json](data/mcp-api-map.json). **It is unverified.** It was
  written from memory of github-mcp-server, not read from its source, and its
  `verified` flag is `false` until someone checks it against the pinned commit
  (the one `data/mcp-tool-schemas.json` records). `record.mjs` resets it to
  `false` whenever it repins the map to a different commit. Notably it assumes
  `get_review_comments` is one GraphQL query and `get_check_runs` is two REST
  requests. Correct the file and re-run the bench if it is wrong.

A call whose cost is not derivable from its command (a stack tick, a poll
tail, a hidden mutation) carries an explicit `api`; every other call is
classified from its command, and an unrecognized command throws.

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

- **Real token counts.** 3.5 characters per token is applied to every arm.
  JSON tokenizes denser than Markdown, so the estimate undercounts the
  JSON-heavy baselines.
- **Reasoning tokens.** The baselines must also classify raw state (Is this
  thread already handled? Is this failure a flake?), work pr-shepherd's output
  has already done. This benchmark counts none of it.
- **Wrong turns.** The behavior evals show the baselines blocking on
  `gh run watch`, stopping early or rerunning real failures. Each of those costs
  more than any row here.
- **Agent work.** Code edits, commits and pushes are the same in every arm and
  are excluded.
- **Real rate-limit cost.** The GitHub API numbers are assumptions, and the MCP
  mapping is unverified. GraphQL point cost also depends on query shape and
  node counts, which a flat 1 or 2 points per call ignores. REST conditional
  requests (ETag/304) are not modeled. Real sessions run the annotation
  supplement more often than the bench: GitHub currently adds an
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

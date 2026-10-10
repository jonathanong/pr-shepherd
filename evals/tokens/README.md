# Token-cost benchmark

**How many fewer tokens and turns does an agent spend when it shepherds a PR
with pr-shepherd instead of the gh CLI or the GitHub MCP server?**

The behavior evals one directory up ask whether the agent acts correctly. This
benchmark asks what the work costs. The null hypothesis is that an agent with
only `gh` or only the GitHub MCP server reaches the same state for the same
cost.

Latest numbers: [REPORT.md](REPORT.md). Estimated cost per session:

| session   | cost vs. gh | cost vs. MCP | turns vs. gh / MCP | tool tokens vs. gh / MCP |
| --------- | ----------- | ------------ | ------------------ | ------------------------ |
| single PR | **−50%**    | **−72%**     | −41% / −60%        | −71% / −87%              |
| PR stack  | **−54%**    | **−61%**     | −58% / −60%        | +25% / −42%              |

The savings are concentrated. Re-read review history, CI logs, CI polling and
stacks account for nearly all of them. Against a frugal gh agent, a single
fresh read-and-reply tick is a wash: between 9% cheaper and 6% dearer. See "Where
pr-shepherd does not save".

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

On a stack, neither baseline has pr-shepherd's overview. Each walks the stack
through its branch chain from the anchor, one `gh pr list --head|--base` (or
`list_pull_requests`) call per layer, then reads every open layer in full. A
stack merge without the `gh stack` extension goes bottom-up, re-checking each
layer's base after GitHub retargets it.

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

Setup output stays in context. The skill and playbooks for pr-shepherd, and
the loaded schemas for MCP, ride along on every later request in the session.

The pr-shepherd arm follows the skill and runs `--until-terminal`. That poll
blocks through WAIT ticks, printing one stderr line per tick, and keeps going
through MARK_READY. So a CI wait is one call, and marking a draft ready costs no
call of its own. The blocking call's final result is the next scenario's tick,
so that call is counted twice against pr-shepherd.

The report has one total for a PR session and one for a stack session. Each
total adds its own setup. The stack session counts only stack-level ticks; the
one-PR sessions it routes are PR sessions. The "per tick" figures are weighted
by scenario frequency and baseline cost, excluding setup.

A † in the report marks a baseline that cannot finish the step with its tools
(the GitHub MCP server cannot read check annotations, enqueue a PR, or see a
PR's merge-queue membership). Its cost
then covers only what it could do, so the saving shown understates the gap. Every knob is in `MODEL` in [lib.mjs](lib.mjs) and is
printed at the bottom of the report.

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
- two ticks waiting on the merge queue;
- one stack merge.

These are assumptions, not measurements. See "Next steps".

## Where the savings come from

- **History is re-read every tick.** After one review round, `gh pr view
--json comments,reviews` and the MCP readers return every bot summary and
  resolved thread again: about 8.5k tokens on #505. pr-shepherd's seen markers
  surface each item once. This is most of the gap in the `-with-history`,
  `mark-ready` and `merged` scenarios.
- **Logs are excerpted.** On the real log, pr-shepherd's excerpt is about 1.1k
  tokens. `gh … --log-failed | tail -n 200` is about 7k. MCP's default
  500-line tail is about 11k, and none of it is the failure: on this log the
  last 500 lines are all Codecov upload and post-job steps. The MCP arm asks
  again for 1,000 lines, and the host truncates that at its 25k-token cap.
- **Polling happens inside the CLI.** One blocking `--until-terminal` call
  replaces a minute-by-minute re-check, and it carries on through MARK_READY.
- **Stacks need one overview, not a walk.** A baseline needs one turn per layer
  to find the stack and one more to read it. pr-shepherd needs one call.

## Where pr-shepherd does not save

- **Setup.** The skill and every playbook the session's outputs name cost
  about 2.2–3.0k tokens. Those tokens then ride along on every later request.
  gh needs nothing.
- **Fresh single-step ticks against gh.** A frugal gh agent selects `--json`
  fields and replies with `gh api --silent`. On these steps pr-shepherd lands
  between 9% cheaper and 6% dearer than gh, because its Markdown output and
  carried skill context offset the saved reads. Against MCP's five-reader
  observe, pr-shepherd still saves 4–19% on each, and 67% on `multi-category`,
  where MCP's log retries dominate. The steps:
  - `bot-review-summary`, `review-thread`, `multi-category` and `bot-threads`;
  - `conflicts`, `merge` and `merge-queue`.
- **Stack token volume.** Each routed layer's first tick prints its own
  instructions. In the stack session pr-shepherd reads 25% more tool tokens than
  gh's terse per-layer reads. It still costs 54% less, because it takes 10 turns
  where gh takes 24.

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

## Next steps

1. **Live A/B.** Run the same scenarios end to end with
   `claude -p --output-format stream-json`, with and without the plugin,
   against throwaway PRs on a sandbox repository. Read the real `usage` blocks
   and turn counts, then calibrate this model against them.
2. **Mined weights.** Replace the assumed weights with the per-action tick
   distribution from real transcripts, the same corpus behind cases 01–12.
3. **Exact tokens.** Count each payload with the Messages API `count_tokens`
   endpoint instead of the character ratio.

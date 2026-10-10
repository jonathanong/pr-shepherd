# Token-cost benchmark

**How many fewer tokens and turns does an agent spend when it shepherds a PR
with pr-shepherd instead of the gh CLI or the GitHub MCP server?**

The behavior evals one directory up ask whether the agent acts correctly. This
benchmark asks what the work costs. The null hypothesis is that an agent with
only `gh` or only the GitHub MCP server reaches the same state for the same
cost.

Latest numbers: [REPORT.md](REPORT.md). In a typical PR session pr-shepherd
cuts estimated cost by **44% vs. the gh CLI** and **59% vs. GitHub MCP**, with
35–58% fewer turns and 83–85% fewer tool-result tokens.

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

Each scenario in [scenarios.mjs](scenarios.mjs) is one step of a PR's life. It
is played three ways over **identical GitHub content**:

| arm         | what the agent runs                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pr-shepherd | `pr-shepherd <PR> --until-terminal`, then the printed `apply review` command when there is one                                                                                       |
| gh CLI      | `gh pr view --json <fields>` plus one `gh api graphql` thread query per tick, then `gh run view --log-failed \| tail -n 200`, `gh api … /replies` and `gh pr ready` as the step needs |
| GitHub MCP  | five `pull_request_read` calls per tick (`get`, `get_check_runs`, `get_review_comments`, `get_reviews`, `get_comments`), then `get_job_logs`, `add_reply_…` and `update_pull_request` |

Each baseline is a competent agent, not a straw man. The gh arm selects
`--json` fields instead of dumping raw REST output, and tails the log. The MCP
arm loads tool schemas on demand.

Where the content comes from:

- **pr-shepherd output** is the CI-checked snapshot of a `test-cases` fixture.
  For the failing-check scenario, the snapshot's log excerpt is replaced with
  the one pr-shepherd's own `buildLogExcerpt` produces from a real log.
- **Baseline payloads** are rendered from the same fixture's GitHub state, using
  response shapes copied from real `gh` and github-mcp-server responses.
- **Real data** (`data/`, all public):
  - A 194 KB failed Actions log from this repository.
  - The review history of [jonathanong/pr-shepherd#505](https://github.com/jonathanong/pr-shepherd/pull/505):
    three bot reviewers, two resolved threads and 28 KB of bot comments.
  - A real REST reply object.
  - github-mcp-server's own tool-definition snapshots.

Each scenario reports four numbers per arm:

- **tool calls**.
- **turns**: one turn per round of parallel calls. This is generous to the
  baselines, which can fire all their reads at once.
- **tool tokens**: commands plus results, after the host's output caps.
- **cost (ITE)**: input-token equivalents. Every turn re-reads the context from
  cache (×0.1), writes new tokens to cache (×1.25), and pays output price (×5)
  for the commands it emits. The base context is 30k tokens. Turns cost money
  even when they fetch little; this column captures that.

The "per tick" figures are weighted by scenario frequency and baseline cost,
excluding one-time setup. Every knob is in `MODEL` in [lib.mjs](lib.mjs) and is
printed at the bottom of the report.

### Weights

`weight` is how often a step happens in one typical PR session:

- two CI runs to wait out (the first push and one fix);
- one failing check;
- one review-summary first look;
- two review threads (one before and one after a review round);
- half a multi-category tick;
- one mark-ready;
- one merge.

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
  last 500 lines are all Codecov upload and post-job steps. An MCP agent would
  need another call to find the error.
- **Fewer turns.** One CLI call replaces two to five reads, and the poll replaces
  minute-by-minute re-checks.

pr-shepherd pays a one-time setup cost: the skill and two playbooks, about 2.9k
tokens. A single WAIT tick is larger than one `gh pr checks` line. Both are in
the report.

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

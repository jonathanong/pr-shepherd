# GitHub API

[← README](../README.md) | [context.md](context.md)

This page covers how Shepherd talks to GitHub: transport selection, how GitHub meters each transport, quota warnings and backoff, and how to read spend. The transport details and per-command costs live on separate pages:

| Page                                   | What it covers                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [graphql.md](graphql.md)               | GraphQL transport: batch query, pagination, operation catalog, fingerprint skip, REST calls it makes |
| [graphql-usage.md](graphql-usage.md)   | GraphQL points per command and per tick                                                              |
| [rest.md](rest.md)                     | REST transport: snapshot coverage, conditional reads, fields REST cannot supply, `ccr` proxy routes  |
| [rest-usage.md](rest-usage.md)         | REST `core` requests per command and per tick                                                        |
| [authentication.md](authentication.md) | Credential sources and which token pools share quota                                                 |

## Transport selection

`github.transport` selects `auto` (default), `graphql`, or `rest`; the CLI `--transport` flag and library/MCP option select the same mode. In `auto`, `CLAUDE_CODE_REMOTE=true` starts with REST. Elsewhere Shepherd starts with GraphQL and switches to REST for the rest of the process only after the recognized Claude Code GraphQL 403, proven primary GraphQL exhaustion, or an outage after bounded retries. Credential errors, ordinary permission/query errors, and secondary limits do not trigger fallback. Proxy settings apply to both clients. See [configuration](configuration.md#github-api-transport).

REST may not provide every field available through GraphQL; unavailable fields stay unknown, and transport-unsupported operations produce a surfaced skip, error, or escalation. Each selected transport's text, JSON, and MCP outputs still project equivalent available information. A clean merge state with complete CI and complete feedback evidence can establish READY even if REST cannot supply `reviewDecision` or branch-protection details. The missing `reviewDecision` alone never blocks READY, because neither transport uses it to derive readiness; a non-clean state still needs readable branch policy. A queued PR may use REST for supported queue interactions; queue enqueue is not presumed GraphQL-only. What REST leaves unknown, and which operations it cannot perform, is in [rest.md](rest.md). Handoff behavior is in [escalations](escalations.md#transport-unsupported).

In `auto` mode, a recognized GraphQL quota refusal without a usable GraphQL quota sample triggers `GET /rate_limit`; only a measured empty GraphQL bucket authorizes fallback. A healthy, malformed, or unavailable probe preserves the original error. Secondary limits and forced `graphql` mode never trigger this probe. A transport switch is logged once in verbose output; it is not a signal that the original error was harmless or that the two snapshots have identical fields.

GraphQL mode still makes some REST calls (mergeability refreshes, startup-failure runs, Actions jobs and logs, idle wait detectors, the `GET /rate_limit` exhaustion probe, and `--until-terminal` closure probes). They are listed in [graphql.md](graphql.md#rest-calls-in-graphql-mode).

## GitHub metering

GitHub meters the two transports in separate pools:

- **GraphQL** is metered in **points per hour**, not HTTP requests. A typical user PAT is **5,000 points / hour**; GitHub App installation tokens can be higher. How a query is priced is in [graphql.md](graphql.md#how-github-prices-a-query).
- **REST** uses the `core` pool, metered in **requests per hour**. A conditional read answered `304 Not Modified` is not charged. See [rest.md](rest.md#conditional-reads).

Exhausting GraphQL does not exhaust REST, and vice versa.

| Limit                 | What it is                                                             | How Shepherd sees it                                                                                                           |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Primary GraphQL quota | `x-ratelimit-remaining` / `rateLimit.remaining` on resource `graphql`  | `apiUsage.graphql`, `quotaWarning`, pagination abort at remaining 0                                                            |
| Primary REST quota    | `x-ratelimit-remaining` on resource `core`                             | `apiUsage.rest`, `quotaWarning`; Actions jobs-list and startup-failure pages stop at remaining 0                               |
| Secondary rate limit  | Burst / concurrency / mutation abuse. **Does not** decrement remaining | HTTP 200 with GraphQL errors, or HTTP 403, often with `Retry-After` and a `secondary rate limit` message; `EXIT.TEMPFAIL` (75) |
| GraphQL node cap      | One query may not request more than 500,000 potential nodes            | Query rejected; not a quota warning. See [graphql.md](graphql.md#how-github-prices-a-query)                                    |

`apiUsage` retains telemetry from both pools, including GraphQL attempts made before an automatic switch. Quota warnings and poll cadence follow the active transport: REST mode uses REST core only, while GraphQL mode considers GraphQL and REST core usage. A pending REST core warning remains active through the poll loop; stale GraphQL warnings are discarded after a switch.

`graphqlWithRateLimit` (in `github/graphql-http.mts`, re-exported from `http.mts` / `client.mts`) and `restWithRateLimit` parse `x-ratelimit-remaining` / `x-ratelimit-limit` / `x-ratelimit-reset` (and `Retry-After` when present). Failed REST calls throw `GitHubRequestError` with that metadata. The headers are merged with GraphQL's `rateLimit` selection in `github/api-telemetry.mts`, so ordinary requests need no extra quota call.

## Per-tick budget

The built-in single-PR poll interval is **60s** (`poll.intervalSeconds`). `--stack` and multi-PR polls default to that interval times `poll.stackIntervalFactor` (built-in **2**, so **120s**) because each tick reads the stack summary, whose cost grows with the number of PRs. An explicit `--interval` overrides either default and is not multiplied again. Ready-delay is **10 minutes**.

| Situation                   | GraphQL transport                                                                                                                                       | REST transport                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One PR, changed tick        | 1 point (`BatchPr`), plus supplements                                                                                                                   | 14 core requests for an unprotected base and single-page lists (13 charged on a cold cache), plus one per extra page and one for a protected base; only reads whose resource changed are charged |
| One PR, unchanged wait tick | 1 point (fingerprint hit), or 0 points and 0 core requests while the idle wait detectors all answer 304, with one `BatchPr` per `poll.reconcileSeconds` | 0 requests (1 in a Claude Code cloud session, for the `ccr` thread read)                                                                                                                         |
| `--stack` summary           | `PollStackSummary`, about 0.52 points per layer (minimum 1), plus 1 topology point on the anchor's first tick                                           | 126 requests for 10 layers without validators (136 in cloud), 104 charged on a cold cache; 0 when unchanged (10, one `ccr` thread read per layer, in cloud)                                      |
| Detail                      | [graphql-usage.md](graphql-usage.md), [graphql.md](graphql.md#per-tick-budget)                                                                          | [rest-usage.md](rest-usage.md)                                                                                                                                                                   |

## Quota warnings and cadence

- `--verbose` prints command-scoped `apiUsage` (credential source, request count, measured query cost, node count, remaining/limit/reset, and REST `notModified` counts).
- `watch.graphqlQuotaWarnings` (default 30% → 2x, 20% → 5x, 10% → 10x the configured `poll.intervalSeconds`) emits a one-shot-per-worktree-per-credential-per-window `quotaWarning` on non-terminal results for GraphQL and, with the same bands, REST `core`. An older sample in that window does not warn again; a changed credential fingerprint does. Each REST resource uses the fingerprint of the credential that supplied its own quota sample. A credential change accepts that credential's current sample even when its remaining budget is higher before the previous reset. Bands can instead use absolute `pollIntervalMinutes`, or specify both and take the slower result. The skill / MCP caller is told to slow down. It recommends an explicit REST `gh api repos/OWNER/REPO/pulls/PR` read for incidental work only when REST core is still above those bands. When both budgets are low, one combined warning uses the later reset and does not recommend moving work between them.
- The **poll dispatcher** (`pr-shepherd [PR]`, including `--until-terminal`, and aggregate `--stack` / multi-PR polls) also **applies** those bands: waiting sleeps use `max(effective interval, active band interval)` from the tighter of GraphQL and REST core remaining percent (REST mode considers REST core only; see [GitHub metering](#github-metering)), every tick, even after the one-shot warning has already been claimed. Factors always use configured `poll.intervalSeconds` rather than an explicit flag or `poll.stackIntervalFactor`, preventing compounding; a slower explicit interval remains in force. Stack and multi-PR polls that omit `--interval` already use `poll.intervalSeconds * poll.stackIntervalFactor` (built-in 120s) as that effective interval, so with the defaults a stack sleeps 120s until a tighter band is slower than that. The active band is the crossed entry with the lowest `remainingPercent`, matching `quotaWarning`. Single-tick `iterate` and MCP `iterate` stay advisory — those callers own recurrence.

## Rate-limit backoff

- In `auto` mode, proven primary GraphQL exhaustion switches the operation and subsequent work to REST.
- `--until-terminal` keeps polling while a remaining rate limit is the only failure, including forced `graphql` mode or exhausted REST core. An exhausted primary limit (`remaining` 0, GraphQL or REST core) sleeps until `resetAt`, then 5 seconds, then `resetAt % 5` extra seconds, so the retry does not land on the reset instant. An explicit `Retry-After` is still honored in full. A secondary limit without `Retry-After` waits 60, 120, 240, 480, then 960 seconds across five consecutive responses; a sixth exits 75 if there was no successful tick. A later primary `resetAt` clears the no-progress count. An unchanged or missing primary `resetAt` backs off 15s, then 30s, then 60s; its sixth consecutive response exits 75. A successful tick clears either budget. Bounded polls and single-tick `iterate` still fail with 75 on the first rate-limit error.
- Only proven primary GraphQL exhaustion permits REST closure probes between sleep intervals. A secondary throttle never starts these probes, even if its response carried a GraphQL resource header. A merged or closed PR returns `CANCEL` without waiting out a primary reset. A REST core limit on the probe skips further probes for the rest of the sleep and does not throw. `--stack` / multi-PR polls probe each tracked open layer and return the all-terminal `CANCEL` only when every tracked layer is merged or closed. A partial merge keeps sleeping.
- REST branch-policy reads propagate primary and secondary throttling, `Retry-After`, and session refusals. These responses cannot be treated as ordinary unavailable policy; polling retries throttling before making a readiness or merge decision.

## How to read spend

1. Pass `--verbose` on iterate or poll. Markdown adds `## GitHub API usage`; JSON includes `apiUsage`.
2. `npx pr-shepherd admin log-file` — each response line carries quota headers, cost (GraphQL), and credential source.
3. A `quotaWarning` / `## GitHub API quota warning` block is the primary remaining% crossing a configured band. It is **not** emitted for secondary limits.
4. Exit code 75 with `Retry-After` and a `secondary rate limit` message is a burst throttle, not an empty hourly bucket. Back off; do not assume REST is also exhausted.

## Operational advice

- **Give Shepherd its own credential when you need isolation.** The agent’s GitHub MCP, Copilot, and `gh api graphql` share the GraphQL pool with whatever token they use. A second PAT for the **same GitHub user** does not isolate quota. Use a GitHub App **installation** access token or a different GitHub user for a separate point budget; a dedicated PAT still helps with least-privilege and audit. See [authentication.md](authentication.md).
- **Always pass the PR number** (or URL / `owner/repo#N`) so Shepherd does not look the PR up by branch.
- **Do not also poll with GitHub MCP GraphQL** or `gh pr checks` / `gh pr watch`. Incidental one-off REST reads should name the endpoint explicitly, for example `gh api repos/OWNER/REPO/pulls/PR`.
- When a `quotaWarning` is returned, follow `## Instructions`: keep using pr-shepherd at the printed cadence. For `--until-terminal`, pass `--interval` from the warning and omit `--timeout`. Resume full cadence after the printed reset time.

Further work, if spend is still high: token-scoped quota state so two worktrees sharing one credential share warned bands (today warnings are per worktree). GraphQL-specific follow-ups are in [graphql-usage.md](graphql-usage.md#recommendations).

# Event-driven waits with hook-harness

By default a poll sleeps `poll.interval-seconds` between ticks. With [hook-harness](https://github.com/jonathanong/hook-harness) as an event source, the poll instead waits for a GitHub webhook event that concerns the PR, then runs a normal tick. Quiet PRs cost fewer GitHub calls, and a push or check result is noticed within seconds rather than at the next interval.

This is opt-in and changes only when ticks happen. The tick itself, its output, JSON, and exit codes are the same. Events never cause a mutation.

## How it works

A GitHub App's webhooks reach a hook-harness relay, which keeps normalized events for one day. Shepherd polls the relay over plain HTTP, using the same credentials as `hook-harness`. It needs no extra dependency.

1. A tick runs and returns `WAIT`.
2. Shepherd waits for an event that matches the PR, or until the deadline.
3. After the first match it settles for 10 seconds so a burst of events produces one tick, and never starts a tick sooner than `poll.interval-seconds` (or a larger quota-band interval) after the previous one began. Events can make ticks less frequent than plain polling, never more frequent.
4. The next tick runs.

An event matches when it is for the same repository and any of these holds: it lists the PR number; its head SHA is the PR's head SHA; its head ref is the PR's head branch; it is a merge-queue ref for the PR (`gh-readonly-queue/<base>/pr-N-...`); or it is a push to the PR's base branch. Events for other PRs that share the base branch do not match.

While the source is healthy, a quiet wait lasts `events.fallback-interval-seconds` (default 300, at most 86400), never less than `poll.interval-seconds`. The fallback exists because events can be lost. A merge-state recheck (GitHub still computing mergeability) keeps the plain interval.

## Setup

1. Log in once with a token that can read your repositories:

   ```bash
   npx -y hook-harness@0.3.4 token create --repos 'owner/*,other/*' --label pr-shepherd --login
   ```

2. Enable it in `.pr-shepherdrc.yml`:

   ```yaml
   events:
     source: hook-harness
   ```

Shepherd stores no URL or token. It resolves the source in this order:

1. `HOOK_HARNESS_SOURCE`, the URL of a local `hook-harness serve`, with an optional `HOOK_HARNESS_SOURCE_TOKEN`.
2. `HOOK_HARNESS_URL` and `HOOK_HARNESS_TOKEN`, each overriding the matching field below.
3. `client.json` from `HOOK_HARNESS_CONFIG_DIR`, else `$XDG_CONFIG_HOME/hook-harness`, else `~/.config/hook-harness`.

If nothing resolves, a URL is not `http(s)`, or a token would go over plain `http` to a host other than loopback, the poll fails at startup with a config error that names the login command. Tokens are never logged.

Each relay read costs the owner's whole partition. When more than three to five watchers run at once, run one `hook-harness serve` and point `HOOK_HARNESS_SOURCE` at it. A serve source covers only its own owner.

## Health and fallback

- 401 or 403: the token cannot read that owner. Shepherd notes it once and waits normally for that owner's PRs for the rest of the run.
- 5xx, 413, network errors, timeouts, malformed pages, and a reported gap: the source is unhealthy. Waits use `poll.interval-seconds` until a later wait succeeds, and the recovery is noted once.
- Shepherd also sends an optional `filters` hint so the relay returns fewer events. If the relay rejects it (HTTP 400 `invalid filters`), that is logged once and the run continues without it. Matching always also happens locally.

Notes go to stderr and the per-worktree debug log. Wake reasons appear on stderr only with `--verbose`.

## Limits

- Events are coarse. A `check_suite` event says some CI changed, not which check, so a wake-up is a prompt to tick, not a verdict.
- A 413 or 5xx can drop events, which is why the fallback interval exists.
- The first wait can wake on an event replayed from shortly before the poll started. The settle window and gap bound the cost.
- Relay-side filters cannot express merge-queue refs, so a check suite that completes on `gh-readonly-queue/...` arrives only when it matches locally from an unfiltered page, or at the fallback interval. The queue's `merge_group` events and the PR's own `pull_request` closed event carry the PR number and do wake the wait.
- A stalled `serve` stream is not detected; the fallback interval still bounds the wait.
- Single ticks (`iterate`, MCP, library, `CLAUDE_CODE_REMOTE=true`) never wait, so they ignore `events`.

See [configuration.md](configuration.md#events) for the keys.

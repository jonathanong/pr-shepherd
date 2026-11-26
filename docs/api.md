# Programmatic API

[← README](../README.md)

The TypeScript entry points of the `pr-shepherd` npm package and what each method accepts and returns. MCP host setup: [mcp.md](mcp.md).

| Entry point            | Exports                                                                                          | I/O                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `pr-shepherd`          | `createPrShepherd`, `PrShepherdValidationError`, `PartialApplyError`                             | GitHub, local git, configuration                 |
| `pr-shepherd/journal`  | `extractShepherdJournal`, `reconcileShepherdJournal`, `appendJournalItem`, `validateJournalItem` | None — pure; no GitHub, tokens, or configuration |
| `pr-shepherd/mcp`      | `createPrShepherdMcpServer`, `runPrShepherdMcpStdio`                                             | Same as `pr-shepherd`                            |
| `pr-shepherd/classify` | `ClassifyRule`, `ClassifyItem` types                                                             | None                                             |

## `pr-shepherd`

```ts
import { createPrShepherd } from "pr-shepherd";

const shepherd = createPrShepherd({ cwd: "/path/to/repo", transport: "auto" });

const tick = await shepherd.iterate({ pr: 42, merge: true }); // one tick, with nextCheck
const group = await shepherd.iterate({ prs: [42, 43] });
const verdict = await shepherd.status({ pr: 42, merge: true, readyDelaySeconds: 0 }); // read-only
const stack = await shepherd.stack({ pr: 43 });
const journal = await shepherd.getJournal({ pr: "owner/repo#42" });
const applied = await shepherd.apply({
  pr: 42,
  transport: "rest",
  operations: [
    {
      type: "merge",
      requireSha: "<40-char lowercase sha>",
      mergeAction: "direct_merge",
      mergeMethod: "squash",
    },
    {
      type: "review_mutations",
      replyThreadIds: ["PRRT_…"],
      message: "Fixed the naming.",
      requireSha: "HEAD", // this checkout's commit, or a 40-char lowercase sha
    },
  ],
});
const patches = await shepherd.suggest({
  pr: 42,
  suggestions: [
    { threadId: "PRRT_…", message: "Apply reviewer suggestion" },
    { threadId: "PRRT_…", message: "Apply second suggestion" },
  ],
});
```

`createPrShepherd({ cwd, transport })` returns these methods:

| Method                         | Same as                                  |
| ------------------------------ | ---------------------------------------- |
| `iterate(input?)`              | MCP `iterate` / `pr-shepherd iterate`    |
| `status(input?)`               | None — library only, no CLI or MCP       |
| `stack({ refs })`              | MCP `stack` / `pr-shepherd stack --once` |
| `apply({ pr, operations })`    | MCP `apply`                              |
| `getJournal({ pr })`           | MCP `get_journal`                        |
| `suggest({ pr, suggestions })` | MCP `suggest`                            |

`transport` (`auto`, `graphql`, `rest`) matches the CLI `--transport` option and the [`github.transport`](configuration.md#github-api-transport) key. Fallback triggers: [github-api.md](github-api.md#transport-selection).

### PR references and `cwd`

- `pr` is a positive number, `owner/repo#N`, or a GitHub pull-request URL.
- `getJournal` requires `pr`; the other methods infer the current branch's PR when it is omitted.
- A repository-qualified reference is authoritative for GitHub reads and mutations and may name a repository other than `cwd`.
- `cwd` supplies local git state, configuration, classification rules, and per-worktree debug logging.
- With a repository-qualified `pr`, `cwd` need not be a checkout of that repository, or a git repository at all. Shepherd then reads configuration and classification rules from `cwd` and uses the defaults where `cwd` has none, rather than the target repository's own config. Pass a checkout of the target as `cwd` when its config should apply.

### `iterate`

Every call runs one tick. A singular call returns the raw `IterateResult`, which carries `nextCheck { at, inSeconds, reason }` when another tick is meaningful ([cloud.md](cloud.md#nextcheck)).

A non-empty `prs` set runs one compact summary tick and returns `PollSummaryResult`. Every reference must resolve to one repository. It keeps no ready-delay state and emits no rebase/push commands; its only GitHub mutations (with their seen markers) are rule-driven [classification auto-resolve](actions.md#classification-auto-resolve), reported per row as `ruleAutoResolve`. The caller owns recurrence.

Every `IterateResult` carries `headSha`, the PR head commit that tick evaluated (omitted only when GitHub did not report it). The CLI prints it only with `--verbose`. Terminal `cancel` results (`merged`, `closed`) carry it too. Aggregate `PollSummaryResult` rows already carry their head as `headRefOid`; no `headSha` is added there.

### `status`

`status({ pr?, merge?, readyDelaySeconds?, stallTimeoutSeconds?, transport?, instructions? })` answers "is this PR ready to merge at this exact head?" for an outside supervisor. It runs one single-PR `iterate` tick through the same code path as `iterate` and returns the same `IterateResult`, so its verdict cannot drift from `iterate`'s; read `action` and `headSha` together. There is no `prs` form (it rejects one), and `status` is library only: there is no CLI command or MCP tool.

The contract is read-only:

- **No GitHub mutations.** The tick skips every mutation site: classification-rule auto-resolve/minimize (those IDs stay in the result for the caller, as when GitHub does not confirm a mutation), the in-process minimize of already-seen review summaries, and mark-ready. As a backstop, the GraphQL and REST request layers throw `ReadOnlyViolationError` for a mutation document or any non-GET/HEAD REST method; a normal tick never reaches it.
- **No local state writes.** Nothing under the state directory is created, updated, or deleted: seen markers, fix attempts, stall state, ready receipts, ready-delay marker, fingerprints, REST ETag cache and snapshots, check blockers, follow-up and retrigger markers, quota claims and warnings, signature markers, queue-removal acknowledgments, uncertain-reply records, identity cache. The per-worktree debug log is skipped too. Deletes and clears count as writes, so a stale ready receipt, ready-delay marker, or stall state is never cleared, and a concurrent `pr-shepherd <pr> --until-terminal` session on the same PR is not disturbed. Reads still work: seen markers decide first-look items (a following `iterate` still shows them), and the ready-delay marker decides the countdown.
- **Ready delay.** The marker is never created, refreshed, or deleted. With no usable marker (none, another head, or a future timestamp) the countdown has not started, so a ready PR reports `action: "ready"` with `remainingSeconds = readyDelaySeconds`. With a marker, `status` reports the remaining time it implies. `readyDelaySeconds: 0` has elapsed at once, so a READY PR with `merge: true` returns `action: "merge"`. A current ready receipt also counts as elapsed. Because nothing is written, repeated `status` calls never advance a countdown; only the poll loop or `iterate` does.
- **Drafts.** Marking a draft ready is a GitHub mutation, so a clean draft is treated as if automatic mark-ready were disabled: `status` returns `cancel` with reason `auto-mark-ready-disabled` instead of `mark_ready`.
- **Lock.** `status` takes no watch lock, like the library `iterate`; only the CLI poll loop acquires one (`src/state/watch-lock.mts`), so concurrent calls and a running watcher do not block each other.
- **Printed commands.** Instructions and generated commands in the result are only printed, never run.
- **Stricter than `iterate`.** Skipped mutations only hold a PR back. When its only remaining work is something `iterate` would minimize itself (a rule-matching comment, an already-seen review summary), `status` returns `triage` where `iterate` would go on to `merge`. It never reports ready where `iterate` would not.
- **Reading the verdict.** With `merge: true`, `action === "merge"` together with a matching `headSha` means Shepherd would merge that head now. A clean PR can still return another action: `wait` while it is already queued or set to auto-merge, `cancel` (`auto-mark-ready-disabled`) for a draft, and `wait` when a fresh re-read regresses. Treat every action other than `merge` as not ready.

### `stack`

`stack({ pr })` takes the anchor PR of a native GitHub stack plus the same tick options as `iterate`, runs one aggregate tick, and returns `PollSummaryResult` with the same guarantees and `nextCheck` rule as an aggregate `iterate`.

| Native-stack action | When                                                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHEPHERD`          | Some layer is unready and autonomous. Every layer with work gets a one-PR Shepherd instruction; a mixed state also surfaces any human blocker.                                                             |
| `WAIT`              | The stack is queued, or its layers can only wait. An unchanged idle wait that reaches `stallTimeoutSeconds` returns `ESCALATE` with `stall-timeout`.                                                       |
| `ESCALATE`          | A closed-unmerged layer needs human direction, and no one-PR Shepherd session remains.                                                                                                                     |
| `MERGE`             | With `merge: true`: the highest ready prefix whose bottom open layer targets the stack base. Run `gh stack merge <PR number>` for that prefix, then recheck until every layer merges and `CANCEL` returns. |
| `CANCEL`            | Terminal READY or merged state, including clean drafts left in draft when auto mark-ready is disabled (row reason `draft-auto-mark-ready-disabled`, with no `pollCommand`).                                |

### `apply`

`apply` validates every operation, then runs them in list order. A validation failure throws `PrShepherdValidationError` before any GitHub mutation. A failure after earlier operations succeeded throws `PartialApplyError` with `failedIndex` and `completed`.

| Operation                   | Fields                                                                                                  | Notes                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `merge`                     | `requireSha` (full lowercase SHA), `mergeAction`, optional `mergeMethod`, optional `expectedStack`      | `mergeAction` is `direct_merge`, `merge_queue`, or `default`; `mergeMethod` (`merge`, `squash`, `rebase`) only for `direct_merge`. Requires REST, from the client `transport` option or `input.transport`. |
| `review_mutations`          | `resolveThreadIds`, `replyThreadIds`, `minimizeCommentIds`, `dismissReviewIds`, `message`, `requireSha` | `message` is required for replies and dismissals. `requireSha` is `HEAD` (read with `git rev-parse HEAD`) or a full 40-character lowercase SHA; mutations wait until GitHub reports that PR head.          |
| `mark_files_viewed`         | `files`, `tests`, `matchPatterns`                                                                       | Surfaces GitHub's per-file results. REST reports it as explicitly unsupported.                                                                                                                             |
| `append_journal`            | `item`, optional `dryRun`                                                                               | Honors explicit caller intent.                                                                                                                                                                             |
| `check_blocker`             | `check`, then either `blockedBy` or `clear: true`                                                       | Records or clears a local blocker for one exact failing check, as `apply check-blocker` does. `blockedBy` is a PR/issue URL, `owner/repo#N`, or `issue:owner/repo#N`.                                      |
| `acknowledge_queue_removal` | `requireSha`, `queueCommitOid` (full SHAs), `removedAtUnix` (positive safe integer)                     | Records a local acknowledgment of the current native-stack CI removal; never enqueues or merges. REST returns a transport-unsupported error before GitHub I/O.                                             |

Direct review operations forward every supplied ID without iterate's author, capability, or current-state filtering; GitHub is authoritative for authorization and mutation validity.

#### Merge results

A merge result is `{ pr, repo, status, details, uncertain? }`:

| Field       | Values                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `status`    | `pending`, `enqueued`, `merged`, or `failed`. Pending and enqueued are not merged.                                |
| `details`   | May include `message`, `uuid`, `expected_head_sha`, `merge_action`, `merge_method`, `bypass_rules`, merged `sha`. |
| `uncertain` | `uncertain: true` marks an outcome that needs reconciliation before another request.                              |

The CLI prints the same result as text or JSON. Rerunning the same request resumes its persisted UUID and returns the recorded result; it never submits twice.

| Prior outcome                                      | Treatment                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Definite `failed`                                  | Replacement with changed options allowed.                                                  |
| Definite `enqueued`                                | Replacement only after the PR head changes and a fresh read verifies the new `requireSha`. |
| `pending` or `uncertain`                           | Cannot be replaced.                                                                        |
| HTTP `400`/`409` without the async result envelope | Definite failure.                                                                          |
| Malformed successful response                      | Uncertain — GitHub may have accepted it.                                                   |

REST cannot verify merge-queue removal history, so automatic same-head queue recovery is unsupported and never emitted. Interrupted local replacements resume their persisted intent.

Native-stack merges also accept `expectedStack: { number, baseRefName, prefix }`:

- `number` is the positive stack number; `baseRefName` is its trunk.
- `prefix` is the observed ordered lower prefix through the requested PR. Each entry is `{ pr, headRefName, headRefOid, baseRefName }` with a unique positive PR number and full lowercase head SHA. The final entry must match the requested PR and `requireSha`.
- Generated REST stack commands pass the same object as `--expected-stack '<JSON>'`.
- Missing membership or a changed stack identity, trunk, prefix, or parent ref rejects the request before submission; current READY receipts and topology are also revalidated.
- The guard is persisted with the merge intent, so changing or dropping it cannot bypass pending or uncertain request protection.

#### Queue-removal acknowledgment

The `acknowledge_queue_removal` result contains `pr`, `repo`, and `acknowledgment` with `headSha`, `queueCommitOid`, and `removedAtUnix`. Stack recovery still requires fresh source checks, a current READY receipt, and aggregate lower-layer checks.

#### Session refusals and uncertain replies

On REST, a review mutation GitHub denies (403 or 404) is listed in `deniedIds`. When there is no session refusal, the result's `instructions` say not to retry, escalate, or route around those IDs, then to rerun Shepherd; later generated commands omit them until the item is edited.

A proxy session refusal stops the current review batch and every later `apply` operation. The review result keeps confirmed successes, carries the proxy message in `sessionRefusal`, and lists pending IDs in `unrepliedThreads`, `unresolvedThreads`, `unminimizedComments`, and `undismissedReviews` when nonempty. Its `instructions` tell the caller to repair session repository access and retry only those IDs. No GitHub-denied marker is persisted. CLI text/JSON and MCP Markdown/structured output carry the same partial result; the CLI exits `77`.

Retrying an uncertain GraphQL reply reconciles a fresh transcript against pre-write evidence; see [uncertain reply recovery](comments.md#recovering-an-uncertain-reply).

### `getJournal`

Fetches one PR body through the selected transport and returns the same result as `extractShepherdJournal(body)`, without exposing the body or PR node ID.

| Journal   | Result                        |
| --------- | ----------------------------- |
| Absent    | `{ ok: true, journal: null }` |
| Malformed | `{ ok: false, error }`        |

### `suggest`

Accepts one or more `{ threadId, message, description? }` items and returns an ordered patch list with per-patch commit metadata and shared instructions. It builds against the fetched PR-head blobs, permits a clean local descendant of that head, and returns nothing unless the ordered stream passes `git apply --check`. It never writes a patch file or mutates git.

## `pr-shepherd/journal`

```ts
import {
  appendJournalItem,
  extractShepherdJournal,
  reconcileShepherdJournal,
  validateJournalItem,
} from "pr-shepherd/journal";

const extracted = extractShepherdJournal(liveBody);
if (!extracted.ok) throw new Error(extracted.error);
for (const entry of extracted.journal?.entries ?? []) console.log(entry);

const result = reconcileShepherdJournal(suppliedBody, liveBody);
if (!result.ok) throw new Error(result.error);

const validation = validateJournalItem("- Kept the existing behavior.");
const updatedBody = validation.ok
  ? appendJournalItem(result.body, validation.item).body
  : result.body;
```

| Function                                           | Returns                                                                                                                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `extractShepherdJournal(body)`                     | `{ ok: true, journal: { format, entries } }` for the one visible structural journal; `{ ok: true, journal: null }` when none; `{ ok: false, error }` for malformed, duplicate, mixed, nested, or unrecognized journal content. |
| `reconcileShepherdJournal(suppliedBody, liveBody)` | `{ ok: true, body } \| { ok: false, error }`. Appends a non-empty live journal verbatim when the supplied body omits it; fails closed on malformed, duplicate, ambiguous, or canonical-to-legacy-downgrade containers.         |
| `appendJournalItem(body, item)`                    | Creates or migrates the canonical details container and idempotently appends one item.                                                                                                                                         |
| `validateJournalItem(text)`                        | Discriminated validation result for a `- <text>` item.                                                                                                                                                                         |

Extracted entries keep their leading hyphen-and-space marker and continuation indentation, with line endings normalized to LF; an empty journal returns `entries: []`. Journal-shaped examples inside fenced code, comments, raw HTML, quotes, and list containers are ignored. `<details>` tags inside raw HTML blocks still count toward nesting, so bodies such as Dependabot release notes, whose `</details>` closers follow HTML without a blank line, reconcile normally.

## `pr-shepherd/mcp`

```ts
import { createPrShepherdMcpServer, runPrShepherdMcpStdio } from "pr-shepherd/mcp";

const server = createPrShepherdMcpServer({ cwd: "/path/to/repo" });
await runPrShepherdMcpStdio({ cwd: "/path/to/repo" });
```

`createPrShepherdMcpServer` accepts an optional `shepherd` for tests and exposes `iterate`, `stack`, `apply`, `suggest`, `extract_journal`, `get_journal`, and `playbook`. Selectors, projections, and tool schemas: [mcp.md](mcp.md).

## `pr-shepherd/classify`

```ts
import type { ClassifyRule } from "pr-shepherd/classify";

const rule: ClassifyRule = (item) => {
  if (item.author !== "gemini-code-assist") return null;
  if (!/daily quota limit/i.test(item.body)) return null;
  return { suppress: true, autoResolve: true };
};
export default rule;
```

Put rule files under `.pr-shepherd/classification/`. `ClassifyItem` has `kind`, `id`, `author`, `authorType`, optional `authorAssociation`, and `body`. Rule loading and `suppress` / `autoResolve` behavior: [classification rules](actions.md#classification-rules).

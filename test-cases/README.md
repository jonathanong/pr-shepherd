# test-cases/

End-to-end scenario fixtures for `shepherd iterate` and aggregate polling. Each fixture drives the
real argument parser (`main()`), the full `runIterate` state machine or aggregate coordinator, and
**both** formatters (text + JSON), then snapshots the result. This is the only
place in the repo that exercises the whole pipeline together — everywhere else
under `src/**` is unit-level.

The runner is `index.test.mts` (short — read it directly). The mocking and
fixture-application machinery lives in
[`test-helpers/test-cases/harness.mts`](../test-helpers/test-cases/harness.mts);
its `Fixture` interface JSDoc is the field-by-field reference. This file covers
what that JSDoc doesn't: the traps, the conventions, and the procedure for
adding a fixture.

## Layout

```
test-cases/fixtures/<NN>-<action>-<scenario>/input.json     # the Fixture object
test-cases/snapshots/<NN>-<action>-<scenario>/output.text.md # generated
test-cases/snapshots/<NN>-<action>-<scenario>/output.json    # generated
test-cases/snapshots/<NN>-<action>-<scenario>/output.rest.text.md # generated, only when REST differs
test-cases/snapshots/<NN>-<action>-<scenario>/output.rest.json    # generated, only when REST differs
```

## Transport variants

Every fixture runs twice: once on GraphQL and once on REST (`--transport rest` with
`CLAUDE_CODE_REMOTE=true`, the Claude Code cloud session that supplies complete CCR thread status).
That environment also selects event poll mode, so the REST variant pins `--poll-mode poll` unless the
fixture passes its own `--poll-mode`. It keeps the cloud session's durable state, so generated reply
commands carry `--adopt-existing-replies`. Merged and closed CANCEL output is minimal on both
transports and carries no transport evidence.
The REST input is derived automatically from the GraphQL fixture by
[`test-helpers/test-cases/rest-projection.mts`](../test-helpers/test-cases/rest-projection.mts):
the batch keeps only the keys the production REST reader emits, so `reviewDecision` is `null`,
viewer capabilities are unknown, queue membership and removal history are absent, and threads always
carry their full transcript. Threads take the REST reader's `rest-thread-<root comment ID>` handle,
with the root taken from the `#discussion_rN` URL (or a synthetic root unique in the fixture). The
fixture's seen markers and fix attempts stay keyed by GraphQL thread IDs: the harness records each
GraphQL ID against its root, as an earlier GraphQL tick would have, so every REST variant runs the
REST→GraphQL thread alias path. Branch policy stays readable and equal to the GraphQL policy. REST reads
go through mocked `fetch` routes
([`rest-routes.mts`](../test-helpers/test-cases/rest-routes.mts)); an unrouted REST request or any
GraphQL request during a REST run fails the test. `rest-projection.test.mts` runs the real REST
reader with every field populated and pins the projection allowlists to its output, so a reader change
cannot silently skew the REST variants.

The REST test first asserts that the output carries the canonical transport evidence (the
`**transport** \`rest\``line and`## Unavailable transport fields`in text, per-row`transport`and`unavailable`lines in aggregate text,`transport`/`transportUnavailable` in JSON). It then strips that
evidence and compares the rest with the GraphQL output:

- If the two are equal, no `output.rest.*` file may exist (a leftover one fails the test).
- Otherwise the raw REST output is snapshotted to `output.rest.text.md` / `output.rest.json`. Most
  differences are follow-up commands carrying `--transport rest`, REST merge/mark-ready/stack routes,
  and fields REST cannot read. Review these snapshots by eye like any other.

The action and exit code must match GraphQL unless the fixture declares `restDivergence`
(`action`, `exitCode`, and for aggregate fixtures `reason`/`nextAction`, plus a mandatory `why`). The
test fails if a declared divergence no longer diverges. Other fixture fields:

- `transports: ["rest"]` runs only the REST variant (fixtures `133`–`135`, `140`, `141` and `143`,
  whose scenario exists only on REST); such a fixture has only `output.rest.*` snapshots. Use it
  instead of `args: ["--transport", "rest"]`, which would skip the REST batch projection.
- `restErrorResponses` (path → `{ status, body }`) makes a REST route answer with an error, e.g. a
  refused CCR mutation; `claudeCodeRemote` sets `CLAUDE_CODE_REMOTE=true` on a GraphQL run (the REST
  variant always sets it).
- `restCarryOver` lists GraphQL-only batch keys to keep in the REST projection, modeling evidence
  fetched by an earlier GraphQL tick that survives a switch to REST.

Aggregate fixtures model summary rows directly. Their REST projection
([`rest-summary-projection.mts`](../test-helpers/test-cases/rest-summary-projection.mts)) strips the
GraphQL-only fields (`reviewDecision`, `isInMergeQueue`, `queueRemoval`), then routes each row's
inputs through the real `routePollSummary` twice: as GraphQL read them (including queue membership
and a denied mark-ready capability) and as REST reads them. A row whose two routes differ takes the
REST route and its recomputed poll command; a READY receipt REST evidence cannot certify is dropped.
Rows that route identically keep their written `action` and `reasons`, including projector overlays
such as `ready-delay` or `blocking-reviewer-in-progress`. `test-cases/format-parity.test.mts` and
`src/skill-playbook-pointers.test.mts` cover both variants.

`<action>` must be one of `cancel`, `wait`, `fix-code`, `mark-ready`,
`escalate`, `merge` (hyphenated) and must match what iterate actually emits —
`index.test.mts` derives the expected action from the directory name and fails
the fixture if they disagree. This exists because three fixtures drifted from
their names during development (see git history for
`24-wait-review-summary-already-surfaced`,
`32-fix-code-pr-level-changes-requested`,
`44-fix-code-seen-bot-thread-resurfaced`) with nothing catching it.

`snapshots/apply-review-*/` have no fixture directory. `apply-review.test.mts` records them by
driving `apply review`'s REST mutation path against a local GitHub wire, with the exit code
appended to the text snapshot. The evals replay them as the turn before an iterate tick.

Aggregate fixtures set `"mode": "aggregate"`, provide `aggregateSummary`, `expectedReason`, and
the exact bare-poll `args`. Their directory name need not encode a singular action because aggregate
rows can mix actions; the runner instead pins `mode: "summary"`, `reason`, exit-code parity, and both
snapshots. Use these fixtures for parser-to-formatter coverage of explicit PR sets and native stacks.

For native-stack fixtures, model the stack in bottom-to-top order. A clean raw GitHub row alone is
not ready: set `readyReceipt: true` only when its one-PR Shepherd session has completed READY after
the ready delay. Assert `stackMergeable` and exact one-PR handoff commands in the snapshots.
Cover the full lifecycle: every layer with work gets a session on the same tick, all receipts and
linear ancestry reconcile successfully, `--merge` names the highest ready prefix, and a queue
remains non-terminal until every layer is merged. Do not assert aggregate rebase/push
instructions: they are intentionally absent.

Transport tests should cover these contracts across HTTP, state-machine, and fixture layers where
appropriate: proxy environment variables configure the HTTP client without network access; `auto`
chooses the configured cloud transport and switches only on the documented GraphQL-blocked response,
exhausted primary quota, or bounded outage; ordinary permission, credential, or query errors and
secondary limits do not switch. REST field gaps remain unknown and allow clean readiness only with
complete CI and no sampled actionable feedback. Unknown capabilities attempt eligible mutations;
GitHub denials use the one-look review skip or `authorization-required` mark-ready path. REST
pagination must surface data beyond first-page limits. Partial writes report completed operations
accurately. Explicit transport selection is honored, stack merge uses the supported selected-transport
route, async merge results persist by operation identifier and resume safely, and text/JSON plus MCP
structured/Markdown stay equivalent. Do not require exact REST/GraphQL parity or silently drop
unsupported operations.

Fixture numbers are not unique today (`42`, `43`, `46`, `47` each have more than
one entry, and `36` is skipped) — this is harmless (directories are addressed
by full name, not by number) but pick an unused number for new fixtures rather
than adding to a collision.

## Traps

These are not obvious from the `Fixture` JSDoc and have each caused a fixture
bug in practice:

1. **`batchData` merges shallow; `config` merges deep.**
   `{ ...DEFAULT_BATCH, ...fixture.batchData }` is a plain object spread — any
   nested object you set (`viewerAuthorization`, `mergeRequirements`, …)
   **replaces** the default wholesale rather than merging into it. If you only
   want to flip one field of `viewerAuthorization`, you must respell every
   other field of it too (see `63-fix-code-conflicts-push-denied`, which
   respells all seven fields to flip `viewerCanEditFiles`). `config`, by
   contrast, is deep-merged onto `defaultConfig()`.

2. **Per-object capability defaults are injected before your fields.** Every
   `reviewThreads` entry gets `viewerCanReply: true, viewerCanResolve: true`;
   every `comments`/`reviewSummaries`/`approvedReviews` entry gets
   `viewerCanMinimize: true`. Your fields override these, so set `false`
   explicitly when you want to test a denial.

3. **`checkAnnotationsByCheckId` keys have a side effect.** Its keys stamp
   `hasAnnotations: true` onto the matching entry in both `batchData.checks`
   and `triagedChecks` — the check's `id` field must equal the map key, or the
   annotations are fetched but the check never shows as having them.

4. **`seenMap` entry shape decides visibility, not just "seen or not."**
   - `{ seenAt, bodyHash: <hash matching the current body> }` → seen and
     unchanged (suppressed on active threads/comments, minimized in-process
     for eligible summaries).
   - `{ seenAt, bodyHash: "aaaaaaaaaaaaaaaa" }` (a deliberate mismatch —
     existing fixtures use this exact sentinel) → forces the "edited since
     first look" path.
   - `{ seenAt }` with **no** `bodyHash` → legacy marker, treated
     conservatively as unchanged, never re-surfaced.
     The hash is `sha256(body).slice(0, 16)` (`src/state/seen-comments.mts:
hashBody`). For an inline review thread, `body` is
     `threadTranscriptBody(thread)` — which is just `thread.body` when the
     thread has no `comments[]` array, and the joined transcript when it does.
     Compute it yourself rather than guessing:
     `node -e "console.log(require('crypto').createHash('sha256').update(BODY,'utf8').digest('hex').slice(0,16))"`.

5. **`stallTimeoutMinutes` (the fixture shortcut) and `config.iterate.*`
   compose**, but only because the harness deep-merges them — don't assume a
   plain-object test elsewhere in the repo behaves the same way.

## Adding a fixture

There is no generator. The procedure:

1. `mkdir test-cases/fixtures/<NN>-<action>-<scenario>/` (pick an unused
   number) and hand-write `input.json` as a `Fixture` object (see the
   interface in `harness.mts` and the traps above). Every fixture needs
   `readyDelayState` and `expectedExitCode` (cross-check the latter against
   [`docs/exit-codes.md`](../docs/exit-codes.md) and the decision table in
   [`docs/iterate-flow.md`](../docs/iterate-flow.md) — don't just paste
   whatever the first run produces).
2. Run `npx vitest run test-cases`. `toMatchFileSnapshot` **writes** the
   missing snapshot files silently on a local run — it does not fail. **Read
   every generated file by eye before committing**, including any
   `output.rest.*` pair. A wrong snapshot is a passing test until someone reads
   it. If the REST action legitimately differs, add `restDivergence` with its
   reason (see "Transport variants"). Vitest also writes a snapshot when the
   test fails, so delete stale `output.rest.*` files before regenerating.
3. If the fixture's Markdown output uses a `Playbook: "<name>".` pointer,
   `<name>` must match a `###` heading in
   [`plugins/pr-shepherd/skills/pr-shepherd/SKILL.md`](../plugins/pr-shepherd/skills/pr-shepherd/SKILL.md)
   or the H1 of a file in that skill's `references/` directory.
   `src/skill-playbook-pointers.test.mts` sweeps the snapshot corpus and the
   instruction sources and fails on an invented or orphaned pointer name.
4. If a fixture's output shows something [`docs/actions.md`](../docs/actions.md)
   or [`docs/escalations.md`](../docs/escalations.md) doesn't describe, that's
   a documentation bug to fix in the same change — not a snapshot to bless
   (see the repo `AGENTS.md`, "Documentation").
5. Commit `input.json` and all generated snapshot files together.

In CI, `vitest` fails on a missing or stale snapshot instead of writing it
(`process.env.CI`, set automatically by GitHub Actions) — so a fixture with no
committed snapshot, or a source change that would change one, is caught, not
silently regenerated.

## Transport scenario coverage

`rest-transport.scenario.test.mts` exercises real local HTTP responses through
the REST reader and iterate/poll orchestration, rather than mocking the
normalized batch. It covers pending CI, a cloud `--until-terminal` invocation
resumed by a fresh transport scope with first-look feedback shown once before
ready evidence is recorded, an unknown thread status escalating after its
one-look display, and cloud CCR mark-ready. These scenarios also assert that
REST ticks do not issue GraphQL requests. `rest-transport.quota-scenario.test.mts` verifies that an automatic poll reaches REST READY evidence after GraphQL exhaustion, both with quota headers and with a confirming REST quota probe, and retains that fallback for subsequent polls. A fallback with unknown-status feedback shows the review once and refuses READY until complete evidence is available. Keep the contract aligned with transport fallback, unknown
capabilities, pagination, partial-write denial, REST-to-GraphQL switching,
async stack resume, and equivalent text/JSON/MCP projections as those
integration cases are added. REST-only fixtures `133` and `134` carry earlier GraphQL queue-removal evidence into REST mode and verify that failed checks remain visible, text and JSON explain unsupported recovery, and no stale same-head requeue or unvalidatable stack acknowledgment command is printed.

`rest-transport.journal-scenario.test.mts` drives ordered library and MCP journal operations through real local HTTP. The GraphQL body read succeeds, its write exhausts quota, and REST completes the write using the read's PR identity. Header-based and probe-confirmed exhaustion are covered. A repeated journal entry causes no duplicate write, subsequent reads retain REST fallback, and MCP structured and Markdown results describe the same operations.

`rest-transport.stack-guard-scenario.test.mts` forwards an expected-stack guard through library and MCP apply operations to real local HTTP. A disappeared stack rejects a new submission without a write. An already-pending UUID resumes by reading its status, while a dropped or changed guard returns an uncertain failure without a duplicate submission. Fixture `135` verifies equivalent CLI text/JSON commands for a REST queue prefix with its full stack guard, even when the configured direct method is disabled.

`rest-transport.feedback-routing-scenario.test.mts` drives real REST polling with authenticated viewer identity and complete CCR thread status. A viewer-owned thread stays eligible for resolve-only retry after a marked reply and finishes after resolution. Another human's root remains reply-only when the viewer authored a later reply. An older human review with closed associated feedback is shown once as stale and asks for re-review. A remaining blocked review gate waits on the approval that branch protection still requires (the missing aggregate `reviewDecision` is not a readiness gap), without resurfacing that review as active fix work. Text and JSON retain matching ownership and stale-review evidence.

`rest-transport.policy-backoff-scenario.test.mts` exhausts GraphQL, then throttles either REST branch-policy endpoint. Primary exhaustion, secondary throttling, and explicit `Retry-After` reach polling backoff before a successful retry finishes with complete readiness evidence. Only sleep is replaced; the transport, HTTP responses, and polling decisions run together. Subsequent attempts stay on REST and perform no writes.

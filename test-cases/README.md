# test-cases/

End-to-end scenario fixtures for `shepherd iterate`. Each fixture drives the
real argument parser (`main()`), the full `runIterate` state machine, and
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
```

`<action>` must be one of `cancel`, `wait`, `fix-code`, `mark-ready`,
`escalate`, `merge` (hyphenated) and must match what iterate actually emits —
`index.test.mts` derives the expected action from the directory name and fails
the fixture if they disagree. This exists because three fixtures drifted from
their names during development (see git history for
`24-wait-review-summary-already-surfaced`,
`32-fix-code-pr-level-changes-requested`,
`44-fix-code-seen-bot-thread-resurfaced`) with nothing catching it.

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
2. Run `npx vitest run test-cases`. `toMatchFileSnapshot` **writes** the two
   missing snapshot files silently on a local run — it does not fail. **Read
   both generated files by eye before committing.** A wrong snapshot is a
   passing test until someone reads it.
3. If the fixture's Markdown output uses a `"<name>" in the pr-shepherd skill`
   pointer sentence, `<name>` must match a real `### <name>` heading in
   [`plugins/pr-shepherd/skills/pr-shepherd/SKILL.md`](../plugins/pr-shepherd/skills/pr-shepherd/SKILL.md)
   — `src/skill-playbook-pointers.test.mts` sweeps the whole snapshot corpus
   and fails on an invented or orphaned pointer name.
4. If a fixture's output shows something [`docs/actions.md`](../docs/actions.md)
   or [`docs/escalations.md`](../docs/escalations.md) doesn't describe, that's
   a documentation bug to fix in the same change — not a snapshot to bless
   (see the repo `CLAUDE.md`, "Documentation").
5. Commit `input.json` and both generated snapshot files together.

In CI, `vitest` fails on a missing or stale snapshot instead of writing it
(`process.env.CI`, set automatically by GitHub Actions) — so a fixture with no
committed snapshot, or a source change that would change one, is caught, not
silently regenerated.

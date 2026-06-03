---
date: 2026-05-25
description: Split resolve command and reject PRRC_* in --minimize-comment-ids
issues: []
prs:
  - 255
session_id: fancy-humming-clover
worktree: fancy-humming-clover
---

# Retrospective: PR #255 - Split resolve command and reject PRRC_* in --minimize-comment-ids

## Session Summary

This session built and iterated PR #255, which addressed a real-world agent failure mode: when both human reply mutations and bot resolve/minimize mutations were present, `--require-sha` was applied to the entire resolve command — including the bot mutations. When the SHA didn't match GitHub HEAD, the whole command failed, and the agent fell back to minimizing individual `PRRC_*` comments, which is invalid.

Two changes landed together:

1. **Split resolve command**: When both reply and resolve/minimize mutations exist, emit two separate commands: `resolve-only:` (no SHA, for bot threads and minimize-only mutations) and `resolve:` (with `--require-sha`, for human replies). The split is generated in `buildResolveCommand` in `src/commands/iterate/classify.mts`.

2. **Reject PRRC_* in `--minimize-comment-ids`**: A new validator in `src/cli/resolve-validators.mts` hard-fails when a `PRRC_*` ID is passed to `--minimize-comment-ids`, with guidance to use `--resolve-thread-ids` with the parent `PRRT_*` thread instead.

A follow-up fix commit corrected guidance text that referred to "the resolve command's `--minimize-comment-ids`" — which was wrong in the split case where minimize IDs land in `resolveOnlyCommand`, not `resolveCommand`.

## What Went Well

- The core classification logic in `buildResolveCommand` was cleanly restructured to return `{ resolveCommand, resolveOnlyCommand? }` rather than a single object — the caller sites (`fix-code.mts`, `render.mts`, `iterate-lean.mts`) adapted naturally.
- New test fixture 46 (bot-only thread, no SHA) was added proactively to anchor the regression prevention.
- The existing snapshots for fixtures 35, 44, 45 were updated and verified correctly.
- The `resolve-validators.mts` module remains separate, keeping `cli-parser.mts` thin.
- CodeRabbit approved; Copilot generated no inline comments; SonarQube quality gate passed.

## What Slowed Things Down

### 1. Guidance text not updated in sync with the split

The `SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE` constant in `shepherd-journal.mts` referenced "the resolve command's `--minimize-comment-ids`" — correct before the split, wrong after it. This was caught by a chatgpt-codex review (P2 finding) after the PR was opened, requiring a follow-up commit.

**Root cause**: The guidance string lives in a separate file (`shepherd-journal.mts`) from the logic that determines which command carries minimize IDs (`classify.mts` / `render.mts`). There is no single source of truth that forces the two to stay in sync.

**Actionable**: When changing which command carries a flag (e.g., moving minimize IDs from `resolveCommand` to `resolveOnlyCommand`), grep for all guidance strings that describe the flag's location and update them in the same commit. Consider co-locating the guidance near the logic that builds the command, or adding a comment cross-reference.

### 2. P1 codex review finding required careful evaluation

The chatgpt-codex review flagged the PRRC_* rejection validator as a P1 — arguing that `PullRequestReviewComment` implements `Minimizable` in GitHub's schema, so PRRC_* IDs should be allowed. Evaluating and rejecting this finding correctly required understanding the original bug scenario (agent workaround, not legitimate usage) and GitHub's schema nuance. The rejection was correct and was documented in the PR shepherd journal entry.

**Cost**: One additional review-and-respond cycle. This was not avoidable given the review, but the reasoning was not documented until the shepherd journal entry.

**Actionable**: For deliberately restrictive validators (ones that reject technically-valid inputs for product reasons), add an inline comment in the validator explaining *why* the restriction exists, so future reviewers (human or AI) can see the rationale without reading the PR history.

### 3. Snapshot update count was high

21 files changed, with 9 snapshot files updated. The high snapshot volume made the diff harder to review and increased the chance of snapshot drift bugs being masked by noise.

**Actionable**: No structural fix here — snapshot updates are load-bearing — but consider running `npm test -- --update-snapshots` only for affected fixtures during development to make the diff more focused.

## What Indirection Exists in the Code

- **`buildResolveCommand` return type**: The function now returns `{ resolveCommand; resolveOnlyCommand? }`. Callers must destructure this and handle the optional. Three call sites (`fix-code.mts`, `render.mts`, `iterate-lean.mts`) each do this independently. If a fourth call site is added without handling `resolveOnlyCommand`, the split will be silently dropped.

  Consider adding a utility that merges or validates the two commands, or adding a comment at the `buildResolveCommand` export that documents the caller contract.

- **`SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE` vs. `render.mts`**: The guidance text and the rendering logic are in separate files with no shared type or test forcing them to stay in sync. The P2 review finding in this session was caused by exactly this gap.

- **`requiresHeadSha` logic in classify.mts**: The condition `threads.length > 0 || checks.length > 0` (code-mutation race condition) is inlined in two places in `classify.mts` after the split (once for `resolveCommand`, once for the fallback single-command path). If the condition changes, it must be updated in both locations.

## Tests to Add

- **Vitest**: A test that calls `buildResolveCommand` with both human reply threads AND bot resolve-only threads, and asserts that `resolveOnlyCommand` does NOT carry `--require-sha` while `resolveCommand` does. (The fixture 45 snapshot covers the rendered output shape; a direct unit test of `buildResolveCommand`'s return value would be more robust.)
- **Vitest**: A test that `SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE` mentions "resolve or resolve-only command" — a simple string assertion that guards against the guidance text regressing to the old wording.
- **Vitest**: Edge cases for PRRC_* rejection: mixed PRRC_* and PRRT_* IDs in `--minimize-comment-ids` (currently untested).

## Tooling / Documentation Gaps

- `docs/actions.md` was updated with the split resolve behavior. No gap there.
- The `CLAUDE.md` section on comment visibility invariants does not describe the `resolveOnlyCommand` field or the split-command scenario. Future agents reading CLAUDE.md won't know the split exists.
  - Actionable: Add a note to CLAUDE.md explaining the split-command case and when `resolveOnlyCommand` is emitted.
- No grep/lint rule enforces that guidance strings are updated when command structure changes. This is a process gap, not a tooling gap — it requires review discipline.

## Actionable Feedback Summary

1. **Co-locate or cross-reference guidance strings**: When changing which command carries a CLI flag, update all guidance strings in the same commit. Add a comment cross-reference between `shepherd-journal.mts` and `classify.mts`/`render.mts`.

2. **Document restrictive validators inline**: Add a comment in `resolve-validators.mts` explaining why PRRC_* is rejected (intentional product decision, not a schema oversight) so future reviewers can see the rationale without the PR history.

3. **Add a direct unit test for `buildResolveCommand` split behavior**: The fixture snapshots cover the rendered output; a unit test asserting the returned `{ resolveCommand, resolveOnlyCommand }` shape would catch regressions before snapshot updates are needed.

4. **Guard `SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE` with a string assertion test**: A simple Vitest test checking the guidance text contains "resolve or resolve-only" would have caught the P2 review finding before the PR was opened.

5. **Update CLAUDE.md**: Document the `resolveOnlyCommand` field and the split-command scenario so future agents understand when and why the split is emitted.

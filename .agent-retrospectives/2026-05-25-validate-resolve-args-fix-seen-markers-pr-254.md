---
date: 2026-05-25
description: Validate --resolve-thread-ids and --require-sha formats; fix seen-marker for auto-minimized bot comments
issues: []
prs:
  - 254
session_id: fancy-humming-clover
worktree: fancy-humming-clover
---

# Retrospective: PR #254 - Validate resolve args and fix seen-markers for auto-minimized comments

## Session Summary

This session iterated PR #254 to merge. The PR bundled two independent fixes:

1. **Seen-marker bug**: Bot comments matched by `minimizeComments` policy were added to `actionable` and `minimizeIds` but never to `toMarkSeen`. After `resolve --minimize-comment-ids` minimized them server-side, the next fetch found no marker and re-surfaced them as first-look items tagged `[status: minimized]`. Fixed by adding these comments to `toMarkSeen` in `classifyVisibleComments`.

2. **Input validation**: Warn when `--resolve-thread-ids` receives `PRRC_*` comment IDs instead of `PRRT_*` thread IDs. Hard-fail when `--require-sha` receives a non-40-char SHA (short SHAs can never match `headRefOid` via strict equality, causing a silent 18-second timeout).

The session involved: the initial fix, a test isolation refactor (vi.clearAllMocks() doesn't reset implementations), the validation feature, formatting cleanup, and a help-text correction from a Copilot review.

## What Went Well

- The seen-marker bug fix was clean and precisely targeted: one line added in `classifyVisibleComments`, mirroring the existing pattern for thread-based items.
- Validation logic was appropriately placed in a new `src/cli/resolve-validators.mts` module, keeping `cli-parser.mts` thin.
- The test file split (200-line lint limit) was handled cleanly by separating threads vs. comments into distinct files.
- The Copilot review finding about "hex SHA" vs. "lowercase hex SHA" in help text was a legitimate catch that landed as a clean one-liner fix.

## What Slowed Things Down

### 1. Test isolation leak discovered post-merge

The `vi.clearAllMocks()` vs. mock implementation reset issue (`mockLoadSeenMap` not being reset to an empty `Map` in `beforeEach`) was not caught before the initial commit. It required a follow-up refactor commit. This is a recurring category of test fragility in Vitest: `clearAllMocks` clears call history but does NOT reset `mockResolvedValue` / `mockReturnValue` implementations.

**Actionable**: Add a note to `test-helpers/commands/check.test-support.mts` (or a test-helpers README) warning that mock implementations must be explicitly reset in `beforeEach`, not relied on `clearAllMocks`. Consider a lint rule or a shared `resetAllMocks: true` Vitest config option.

### 2. Two separate features bundled in one PR

The seen-marker fix and the input validation feature are independent. They were bundled into one PR, which meant more reviewer surface, more CI cycles, and a longer PR description. The session iterated the PR through multiple review rounds.

**Actionable**: For future sessions, consider splitting independent fixes and features into separate PRs to reduce iteration surface.

### 3. Help text imprecision caught late

The `--require-sha` help text said "hex SHA" but the validator enforces lowercase-only hex. This was caught by Copilot review, not by the original author or agent. The fix was trivial (one word), but it required another commit and CI cycle.

**Actionable**: When writing validators that have format constraints (case, length, prefix), ensure the help text mirrors the constraint exactly. Pattern: write the validator and the help text together, review them side by side before committing.

### 4. No test for the double-surfacing regression scenario

The seen-marker bug (minimize-then-re-surface) was fixed without a test that covers the full two-step sequence: (a) classify comment as actionable+minimizeId, (b) write seen marker, (c) on next fetch, comment is `isMinimized: true`, (d) verify it is NOT re-surfaced. The added test `suppresses minimized bot comment that was already seen as actionable` covers part of this, but multi-fetch integration coverage is absent.

**Actionable**: Add a Vitest test that simulates two successive calls to `classifyVisibleComments` with the same comment ID, verifying it does not appear in `firstLookItems` on the second call.

## What Indirection Exists in the Code

- The `toMarkSeen` push in `classifyVisibleComments` (`src/comments/visible-comments.mts`) is the only place where the seen-marker invariant for auto-minimized comments is enforced. It is now guarded by an inline comment, but the pattern is not DRY with the thread-based equivalent. If the two paths diverge again, the bug can silently reappear.
- `cli-parser.mts` calls `warnPrrcThreadIds` and `validateRequireSha` inline in the resolve command handler, before the main dispatch. The validators are in `src/cli/resolve-validators.mts` — a good separation — but there is no shared "validate all resolve flags" entry point. Future validators will be scattered through the handler unless a `validateResolveArgs(args)` aggregator is introduced.

## Tests to Add

- **Vitest**: Two-fetch simulation for seen-marker idempotency (minimize-policy comments do not re-appear after the first seen-marker write).
- **Vitest**: Explicit test for `vi.clearAllMocks()` NOT resetting mock implementations — this is a footgun that burned this session. A short comment or a dedicated test file in `test-helpers/` documenting the pattern would prevent recurrence.
- **Vitest**: Edge cases for `validateRequireSha` — empty string, 39-char string, 41-char string, non-hex characters in a 40-char string.

## Tooling / Documentation Gaps

- The `CLAUDE.md` section on seen-marker behavior is thorough, but there is no inline comment in `visible-comments.mts` summarizing why BOTH `actionable` and `toMarkSeen` must be populated together. The refactor commit added a brief comment; a slightly longer note referencing the CLAUDE.md section would make the invariant discoverable from the source.
- No `validateResolveArgs` aggregator function. Adding one would reduce the risk of future flags being added to the resolve handler without validation.

## Actionable Feedback Summary

1. Add `resetAllMocks: true` to Vitest config or add explicit `mockLoadSeenMap.mockResolvedValue(new Map())` pattern to the `registerHooks` template in `test-helpers/` — document that `clearAllMocks` does not reset implementations.
2. Introduce a `validateResolveArgs(args)` aggregator in `src/cli/resolve-validators.mts` to centralize all resolve-flag validation.
3. Add a two-fetch simulation test for `classifyVisibleComments` to guard against the seen-marker double-surfacing regression.
4. When writing input validators, review the corresponding help text in the same commit to catch case/format mismatches before review.
5. Prefer splitting independent fixes and features into separate PRs to reduce CI cycle count and reviewer surface per iteration.

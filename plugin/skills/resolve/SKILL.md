---
name: resolve
description: "Resolve all inline review comments on the current PR"
argument-hint: "[PR number or URL] [--thread-id ID | --comment-id ID] [--require-sha SHA]"
user-invocable: true
allowed-tools: ["Bash", "Read", "Grep", "Edit", "Write", "Glob", "Skill"]
---

# pr-shepherd resolve — Fix and Resolve Review Comments

Resolve unresolved review threads and minimize PR comments on the current PR — from ALL authors.

## Arguments: $ARGUMENTS

## Steps

1. **Resolve PR number and get context:**

   Parse `$ARGUMENTS`:
   1. Extract and remove any `--thread-id ID` or `--comment-id ID` flags.
   2. Extract and remove any `--require-sha SHA` flag.
   3. Look for a PR number or GitHub PR URL in the remaining text.
   4. If not found, infer: `gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --json number --jq '.[0].number'`
   5. If no PR found, report an error and stop.

   ```bash
   BRANCH=$(git rev-parse --abbrev-ref HEAD)
   LAST_PUSH=$(git log -1 --format=%ct HEAD)
   BASE_BRANCH=$(gh pr view <N> --json baseRefName --jq '.baseRefName')
   ```

   Check if the PR is already merged:

   ```bash
   gh pr view <N> --json state --jq '.state'
   ```

   If `MERGED`, invoke `/loop cancel` via Skill tool (to stop any active loop), output merged message, and stop.

2. **Fetch comments:**

   ```bash
   npx pr-shepherd resolve <N> --fetch --last-push-time "$LAST_PUSH" --format=json
   ```

   The CLI auto-resolves outdated threads.
   Parse the JSON for `actionableThreads`, `actionableComments`, `changesRequestedReviews`, `reviewSummaries`.

3. **Triage each actionable item** into exactly one of these five buckets. Before classifying, read the comment body and — for threads — the referenced file and line.
   - **Fixed** — already addressed in a prior commit; no new work needed.
   - **Actionable** — real issue, not yet fixed; proceed to step 4.
   - **Not relevant** — does not apply to this PR (e.g. comment is about unrelated code).
   - **Outdated** — refers to code that no longer exists.
   - **Acknowledge** — real comment, intentionally not acting on it (e.g. reviewer flagged it as "won't fix" or "not worth it," scope-out decision, deferring to a follow-up PR). Record the one-sentence reason — you will include it in the step 7 report so the user can override.

   Every item returned by step 2 **must** land in one of these buckets. Do not carry an item forward as "unclassified" or silently skip it. If you genuinely can't decide, that's the Acknowledge bucket with reason "unclear — flagging for human review."

   **Review summaries** (`reviewSummaries`): these are PR-level overview bodies from COMMENTED reviews. Bot-generated summaries (authors like `copilot-pull-request-reviewer`, `gemini-code-assist`, or other bot accounts) are almost always noise — default them to **Acknowledge** with reason "bot summary — no actionable content" unless the body explicitly calls out an unaddressed issue. Human-authored review summaries should be read carefully and classified like any other item.

3a. **Prefer commit-suggestion when available.**

> Note: `pr-shepherd iterate` already emits a pre-built `commit-suggestions` invocation under its own `## Commit suggestions` heading when **every** actionable thread carries a suggestion (and nothing else needs fixing). The monitor skill handles that shortcut directly. The logic below applies to the manual `/pr-shepherd:resolve` flow, which fetches via `resolve --fetch` and decides per-thread.

For each **Actionable** thread where the fetch payload returned a `suggestion` field **and** the top-level `commitSuggestionsEnabled` is `true`, let the CLI apply the reviewer's change verbatim instead of re-typing it by hand. This preserves the reviewer's exact text and co-credits them in the commit.

Collect the thread IDs of all such threads, then run:

```bash
npx pr-shepherd commit-suggestions <N> --thread-ids <comma-separated-IDs> --format=json
```

The CLI creates one remote commit with all suggestions applied and resolves the threads it landed. Parse the JSON output:

- `threads[].status == "applied"` — mark these as **Fixed**; do **not** pass their IDs to `--resolve-thread-ids` in step 6 (already resolved).
- `threads[].status == "skipped"` — fall through to manual fixing in step 4. The `reason` tells you why (no parseable suggestion, file changed, overlapping range, etc.).

After a successful run, **your working copy is one commit behind remote**. You MUST run `git pull --ff-only` before making any further local edits in this session — otherwise subsequent commits will either fail to push or clobber the applied suggestion.

If `commitSuggestionsEnabled` is `false`, skip this step and go straight to manual fixing in step 4.

4. **Fix actionable items.** For each Actionable item:
   - Read the relevant file(s) and apply the fix (Edit/Write tools)
   - Re-classify as **Fixed**
   - If too complex: leave as Actionable, report to user

5. **Commit and push** (only if code was changed):
   - `git add <file1> <file2> …` (NOT `git add -A`)
   - `git commit -m "<appropriate commit message>"`
   - If the fixes alter the PR's scope or intent, run `gh pr edit <N> --title "<new title>" --body "<new body>"` to keep the PR title and description in sync with what was committed. Skip if the existing text still accurately describes the PR.
   - `git fetch origin && git rebase origin/$BASE_BRANCH && git push --force-with-lease`
   - Cancel stale CI runs: `gh run list --branch "$BRANCH" --status in_progress --json databaseId --jq '.[].databaseId' | xargs -I{} gh run cancel {}`

6. **Resolve all verified items** — **only if at least one of the three ID lists is non-empty.** If all lists are empty, skip this step entirely (running resolve with no mutation IDs enters fetch mode as a side effect). Build the command from the non-empty ID lists; omit any flag whose list is empty. For Fixed items, this step runs only after the push; Acknowledge / Not relevant / Outdated items can be resolved without a push (and therefore without `--require-sha`).

   Each bucket maps to a mutation flag:
   - **Fixed** threads → `--resolve-thread-ids`; Fixed comments → `--minimize-comment-ids`; Fixed reviews (CHANGES_REQUESTED) → `--dismiss-review-ids --message "<what you changed>"`.
   - **Acknowledge / Not relevant / Outdated** threads → `--resolve-thread-ids`; same-bucket comments → `--minimize-comment-ids`; same-bucket reviews (CHANGES_REQUESTED) → `--dismiss-review-ids --message "<why you're not acting>"`.
   - **Review summaries** in any bucket (Fixed, Acknowledge, Not relevant, Outdated) → `--minimize-comment-ids`. Review summary IDs (`PRR_…` from `reviewSummaries`) are passed here, not to `--dismiss-review-ids`. Do not pass review summary IDs to `--dismiss-review-ids` — that flag is only for CHANGES_REQUESTED reviews.

   ```bash
   npx pr-shepherd resolve <N> \
     --resolve-thread-ids <comma-separated-IDs> \
     --minimize-comment-ids <comma-separated-IDs> \
     --dismiss-review-ids <comma-separated-IDs> \
     --message "<specific description of the fix OR the reason you're not acting>" \
     --require-sha $(git rev-parse HEAD)
   ```

   `--message` belongs **only** with `--dismiss-review-ids`. Omit it entirely when not dismissing a review. When you are dismissing, write one sentence — either describing the actual fix (for Fixed) or the concrete reason for not acting (for Acknowledge). The text is sent to GitHub as the dismissal reason and is shown to the reviewer. Generic text like `"Addressed in <SHA>"` or `"address review comments"` is not acceptable.

   Include `--require-sha $(git rev-parse HEAD)` whenever a push happened in step 5 (it gates the whole command, not per-item — safe to mix Fixed and Acknowledge IDs under one `--require-sha`). Omit it when no code changed.

7. **Report results.** Echo the CLI's output, then append a one-line summary per Acknowledge item: `Acknowledged <threadId|commentId|reviewId> (@<author>): <reason>`. This surfaces the decisions so the user can override any that were wrong.

   If any fetched item was neither resolved nor acknowledged (step 3 is supposed to prevent this, but guard against it), **stop and escalate** to the user: `<N> item(s) fetched but not acted on or acknowledged — need human direction before closing`. Do not silently drop items.

## Rules

- NEVER resolve **Fixed** threads before pushing the fix (use `--require-sha`). Acknowledge / Not relevant / Outdated do not require a push and omit `--require-sha`.
- NEVER blindly resolve items — always read and verify first.
- NEVER silently skip a fetched item. Every item must be resolved, acknowledged with a reason, or escalated.
- Resolve from ALL authors — bots, AI reviewers, and humans alike.
- Prefer `commit-suggestions` over manual edits when a thread carries a `suggestion` block and `commitSuggestionsEnabled` is true — applies the reviewer's change verbatim and co-credits them. After it runs, `git pull --ff-only` **before** any other local edit.
- `--message` is required when using `--dismiss-review-ids`, and must NOT be passed otherwise. The CLI throws if it is missing during dismissal. The message must describe the specific change that addressed the review or the concrete reason for not acting (e.g. `"Added null check in handler.ts:42"`, or `"Acknowledged as won't-fix — reviewer noted not worth refactoring"`); generic boilerplate like `"address review comments"` or `"Addressed in <SHA>"` is reviewer-hostile and forbidden.

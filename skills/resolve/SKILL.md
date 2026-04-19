---
name: resolve
description: 'Resolve all inline review comments on the current PR'
argument-hint: '[PR number or URL] [--thread-id ID | --comment-id ID] [--require-sha SHA]'
user-invocable: true
allowed-tools: ['Bash', 'Read', 'Grep', 'Edit', 'Write', 'Glob', 'Skill']
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
   pr-shepherd resolve <N> --fetch --last-push-time "$LAST_PUSH" --format=json
   ```

   The CLI auto-resolves outdated threads.
   Parse the JSON for `actionableThreads`, `actionableComments`, `changesRequestedReviews`.

3. **Triage each actionable item.** For each unresolved thread or visible comment:
   - Read the comment body to understand what it's asking
   - For review threads: read the referenced file and line
   - Classify as: **Fixed** (already addressed), **Not relevant**, **Outdated**, or **Actionable** (real issue, not yet fixed)

4. **Fix actionable items.** For each Actionable item:
   - Read the relevant file(s) and apply the fix (Edit/Write tools)
   - Re-classify as **Fixed**
   - If too complex: leave as Actionable, report to user

5. **Commit and push** (only if code was changed):
   - `git add <file1> <file2> …` (NOT `git add -A`)
   - `git commit -m "<appropriate commit message>"`
   - `git fetch origin && git rebase origin/$BASE_BRANCH && git push --force-with-lease`
   - Cancel stale CI runs: `gh run list --branch "$BRANCH" --status in_progress --json databaseId --jq '.[].databaseId' | xargs -I{} gh run cancel {}`

6. **Resolve all verified items** — **only after the push:**

   ```bash
   pr-shepherd resolve <N> \
     --resolve-thread-ids <comma-separated-IDs> \
     --minimize-comment-ids <comma-separated-IDs> \
     --dismiss-review-ids <comma-separated-IDs> \
     --message "Addressed in $(git rev-parse HEAD)" \
     --require-sha $(git rev-parse HEAD)
   ```

   The `--require-sha` flag ensures pr-shepherd verifies GitHub has the new commit before resolving.

7. **Report results** from the CLI output.

## Rules

- NEVER resolve threads before pushing fixes (use `--require-sha`).
- NEVER blindly resolve items — always read and verify first.
- Resolve from ALL authors — bots, AI reviewers, and humans alike.
- `--message` is required when using `--dismiss-review-ids`. The CLI will throw if it is missing.

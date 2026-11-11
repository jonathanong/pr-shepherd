# Authenticating as a GitHub App

[← README](../README.md)

How to poll pull requests with a GitHub App installation instead of your personal token. For a user who polls often and does not want to spend their own GraphQL quota. For the token order Shepherd uses otherwise, see [authentication.md](authentication.md).

## Why

GitHub meters each credential separately ([authentication.md](authentication.md#quota-sharing)). A user token, including a PAT or `gh auth token`, draws on the user's budget, shared with every other tool that user runs. A GitHub App installation token has its own budget per installation. Shepherd can mint that token for repositories the app covers, so identity-independent reads spend the installation's quota and leave yours alone.

## What the app answers

The app answers only requests whose answer does not depend on who is asking. Everything else always uses your own token chain, so `viewerCan*`, `viewerDidAuthor`, the viewer login, mutation authorship, and the fail-closed capability rules behave exactly as they do without the app.

| Request                                                   | Credential       |
| --------------------------------------------------------- | ---------------- |
| REST `GET` or `HEAD` of a `/repos/{owner}/{repo}/…` route | App              |
| Any other REST request: writes, `/user`, `/rate_limit`    | Your token chain |
| GraphQL query that selects no viewer-relative field       | App              |
| GraphQL mutation, or a document with any `viewer…` token  | Your token chain |

A GraphQL document is viewer-relative when, after comments are stripped, it contains a word starting with `viewer` (`viewer {`, `viewerCan*`, `viewerDidAuthor`, `viewerPermission`, `viewerLatestReview`) or a `…ByViewer` field. Shepherd decides from the document text at request time.

In practice the app absorbs CI and check pages, check annotations, Actions jobs and logs, ruleset and merge-policy reads, base-behind compares, PR body and head SHA reads, the REST change detectors that make idle waits cheap, and the per-tick `BatchPr` data read.

### The `BatchPr` viewer split

`BatchPr` selects viewer fields, so one document cannot go to the app. With an app covering the repository, a one-PR tick reads it as two parts:

1. **Data read (app).** `BatchPrData` is `BatchPr` with every `viewer…` selection removed, and its follow-up pages (`BatchPrPageData`, `ReviewThreadCommentsData`) are cut the same way. It runs every tick on the installation token.
2. **Viewer read (your token).** `BatchPrViewer` selects only the viewer-relative fields, keyed by the node IDs the data read returned (the PR, its review threads, PR comments, and review summaries and approvals, up to 100 IDs per request). It carries `viewer.login`, the repository's `viewerPermission` and `viewerCanAdminister`, and the PR's and nodes' `viewerCan*` fields. It runs in the same tick as the data read, so reply, resolve, minimize, dismiss, mark-ready, and merge capabilities are never older than the tick. Nothing is cached across ticks, and a node GitHub does not return reads as "no" (fail closed).

`viewerDidAuthor` on thread comments is the tick's viewer login compared, ignoring case and a trailing `[bot]`, with the comment's author login, so it costs no per-comment IDs. The suffix is stripped because an app token's `viewer.login` is `name[bot]` while a bot comment's author login is `name`. IDs beyond 100 go in further requests, up to four at a time; only the first selects `viewer` and the repository. An ID that no longer resolves (a comment deleted since the data read) comes back null beside a `NOT_FOUND` error, and its fields read as "no" instead of failing the tick.

The viewer read is skipped when the first page's fingerprint matches the stored one and the stored report is replayed. A split read's fingerprint holds no viewer values; it holds your token's credential fingerprint in the login slot instead, so a token switch on the same state directory invalidates a replayed report. A combined read's fingerprint (and the READY receipt's) includes the viewer's permission, login, and `viewerCanUpdate`, so receipt and split fingerprints differ. The remaining gap: a permission change under the same token during a run is not seen until the first page changes. A replayed report never carries a reply, resolve, minimize, dismiss, mark-ready, or merge command, and mark-ready refreshes first. A replayed report is an idle wait with nothing to reply to, resolve, or minimize, and a changed first page runs the viewer read again. So a fingerprint-reused wait tick spends no GraphQL on your token.

Residual cost on your token:

- A tick that builds a fresh snapshot (a new check result, a new comment) spends one small viewer read, because the viewer fields decide which items are actionable and are part of the report. That is one cost-1 request per 100 node IDs.
- When the app's GraphQL bucket is exhausted, `BatchPr` uses the single combined query on your token for that window ([below](#when-the-apps-quota-runs-out)), so that tick spends one user request, as without the app.
- A tick that reuses a stored report for a native-stack layer carries only the stack's trunk rules, not its topology (the topology's viewer login and administer bit are unread), so the standalone `PollStackTopology` read supplies it on your token. A snapshot tick carries the topology as before, using that tick's viewer read.

Three cases keep the single combined `BatchPr` query on your token: a repository no app covers (no extra request, nothing to gain); the READY-receipt variant (a READY candidate needs the viewer fields in that tick); and a stack layer read from a stack handoff.

### GraphQL operations

The queries live in `src/github/gql/`. `BatchPrData`, `BatchPrPageData`, and `ReviewThreadCommentsData` are derived at load time from `batch-pr.gql`, `batch-pr-page.gql`, and `review-thread-comments.gql` by removing the viewer selections (`src/github/gql-strip-viewer.mts`). A test pins which bundled documents are app-eligible and that the derived ones contain no viewer token, so adding a viewer field to one of them fails the test.

These queries go through the app:

| Operation                    | When Shepherd sends it                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `BatchPrData`                | The per-tick PR read: checks, threads, comments, reviews, merge and branch-protection state, with no viewer field. |
| `BatchPrPageData`            | Follow-up pages of `BatchPrData` threads, comments, reviews, and checks.                                           |
| `ReviewThreadCommentsData`   | More comments of a review thread, in a split read.                                                                 |
| `CommitCheckContexts`        | More status contexts for a merge-queue commit, past the first page.                                                |
| `PollSummaryCheckPage`       | Older status contexts for one commit in a multi-PR or stack summary.                                               |
| `PollSummaryAnnotationProbe` | Annotation totals for a summary layer that otherwise looks ready.                                                  |
| `CheckRunAnnotationsBatch`   | First annotation page for up to 20 failing check runs.                                                             |
| `CheckRunAnnotations`        | Further annotation pages for one check run.                                                                        |
| `StackHandoffCheckRuns`      | Check run titles, summaries, and first annotations for a stack-layer handoff.                                      |
| `RefRules`                   | Base branch rules and how far the head is behind the base.                                                         |
| `BaseBehind`                 | How far a non-stack head is behind its PR base.                                                                    |
| `UpperLayerConflictTarget`   | Whether a conflicting upper stack layer already contains its base.                                                 |
| `MergedBasePullRequests`     | Merged PRs whose head may be the stale base of a conflict.                                                         |
| `GetPrHeadSha`               | The PR's current head SHA while waiting for a push to land.                                                        |
| `PrNumberByBranch`           | The PR number for the current branch.                                                                              |
| `GetPrBody`                  | The PR body and node ID before a body update. The `UpdatePrBody` mutation is yours.                                |
| `ReplyThreadTranscripts`     | Review-thread transcripts used to write seen markers after `apply review` replies.                                 |
| `ReplyThreadComments`        | Further comments of one of those threads.                                                                          |

These stay on your token:

| Operation                                 | Why                                                                                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `BatchPrViewer`                           | The viewer fields for a split `BatchPr` read: `viewer`, `viewerPermission`, `viewerCan*`.                                                    |
| `BatchPr` (and its READY receipt variant) | The combined per-tick query, used when no app covers the repository, for the receipt variant, and for stack handoffs. Selects viewer fields. |
| `BatchPrPage`                             | Combined follow-up pages, in the same cases as `BatchPr`.                                                                                    |
| `PollStackSummary`, `PollStackTopology`   | Stack and multi-PR summaries. Select viewer fields.                                                                                          |
| `ReviewThreadComments`                    | Combined thread-comment pages, in the same cases as `BatchPr`. Selects `viewerDidAuthor`.                                                    |
| `SuggestionThreads`                       | Threads for `suggest`. Selects viewer fields.                                                                                                |
| `MarkPrReady`, `UpdatePrBody`             | Mutations.                                                                                                                                   |

The `RefRules`, `PrMergePolicy`, and `CommitCheckSuites` fragments are also part of `BatchPr`. They ride on the app in a split read and on your token in a combined one.

The setting is user-level only. Shepherd reads it from `~/.pr-shepherd/`, never from the repository's `.pr-shepherdrc.yml`.

## 1. Create the app

1. Open GitHub settings, then Developer settings, then GitHub Apps, then New GitHub App. For an organization, use the organization's settings instead.
2. Name it (for example "PR Shepherd") and set any homepage URL.
3. Leave the callback URL empty and uncheck **Webhook > Active**. Shepherd polls; it receives no events.
4. Set the repository permissions below.
5. Under "Where can this GitHub App be installed?", choose **Any account** if you will install it on several accounts, or **Only on this account**.
6. Create the app and note its **App ID**.

### Permissions

The app only reads, so it needs no write permission. Grant every read permission below: a request the app answers that lacks one fails with a permission error instead of falling back.

| Permission      | Access | Required | Used for                                                                                                                                 |
| --------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Metadata        | Read   | Yes      | Repository identity. GitHub grants it automatically.                                                                                     |
| Pull requests   | Read   | Yes      | PR body, head SHA, branch lookup, merge policy, and REST PR reads.                                                                       |
| Contents        | Read   | Yes      | Commit, branch, and base-behind compare reads.                                                                                           |
| Checks          | Read   | Yes      | Check runs, check suites, and annotations.                                                                                               |
| Commit statuses | Read   | Yes      | Third-party status contexts in the rollup.                                                                                               |
| Actions         | Read   | Yes      | Workflow runs, jobs, and job logs for failing checks.                                                                                    |
| Issues          | Read   | Yes      | REST change detectors and reads of PR conversation comments (`/issues/{n}/comments`).                                                    |
| Administration  | Read   | No       | Branch protection and rulesets. Without it those fields are not visible to the app; Shepherd treats them as unavailable and keeps going. |

Replies, resolves, dismissals, mark ready, minimizing, merging, and the `gh run rerun` commands Shepherd prints all run under your own token, so none of them needs an app permission.

## 2. Create and store a private key

1. On the app's settings page, under **Private keys**, choose **Generate a private key**. GitHub downloads a `.pem` file.
2. Move it somewhere only you can read and restrict it:

   ```bash
   mkdir -p ~/.pr-shepherd
   mv ~/Downloads/pr-shepherd.*.private-key.pem ~/.pr-shepherd/pr-shepherd.private-key.pem
   chmod 600 ~/.pr-shepherd/pr-shepherd.private-key.pem
   ```

Shepherd accepts only a path to the key, never the key text inline, and never writes tokens to disk.

## 3. Install the app

Install it once per account you want covered: Install App on the app's page, choose the organization or user, then **All repositories** or **Only select repositories**. One app can be installed on many accounts. Shepherd looks up the installation for each repository's owner, so no installation ID is configured.

## 4. Configure Shepherd

Create `~/.pr-shepherd/github-apps.yml`. `PR_SHEPHERD_HOME` overrides the folder (default `~/.pr-shepherd`).

```yaml
apps:
  - app-id: 123456
    private-key-file: ~/.pr-shepherd/pr-shepherd.private-key.pem
    repositories:
      - vouchington/*
      - jonathanong/*
```

| Key                       | Meaning                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apps`                    | Non-empty list. List several apps to use different apps for different owners.                                           |
| `apps[].app-id`           | The app's numeric ID, as an integer.                                                                                    |
| `apps[].private-key-file` | Path to the PEM key. A leading `~/` expands to your home folder; a relative path resolves against `PR_SHEPHERD_HOME`.   |
| `apps[].repositories`     | Non-empty list of `owner/*` (every repository of an owner) or `owner/repo`. Matching ignores case. No other glob forms. |

Unknown keys, wrong types, empty lists, and malformed patterns are errors that name the file and exit `78`. A missing file turns the feature off. If two apps match the same repository, the first one listed wins.

## Precedence

For each eligible GitHub request Shepherd finds the repository it targets: the request's own repository, or the repository the command was started for. If an app's `repositories` match it, the installation token is used, ahead of `GH_TOKEN`, `GITHUB_TOKEN`, and `gh auth token`. Every other request, and every other repository, uses the token order in [authentication.md](authentication.md#token-resolution), unchanged.

A matched repository never falls back to your user token because of a setup problem. If the app is not installed there, or the key cannot be read, Shepherd exits `77` and names the app ID, the repository, and the fix: install the app on that account, or correct `private-key-file`. If GitHub answers `429` or `5xx` while Shepherd looks up or mints the installation token, it exits `75`, which means retry later.

Installation tokens last an hour. Shepherd keeps them in memory, refreshes one five minutes before it expires, and re-mints it after a `401`.

## When the app's quota runs out

If an app-authenticated request hits the installation's primary rate limit (a `403` or `429` with an empty bucket, or a GraphQL `RATE_LIMITED` error), Shepherd:

1. Marks that installation exhausted for that resource until GitHub's reset time. GraphQL and REST `core` are separate buckets, so a GraphQL exhaustion does not divert REST.
2. Retries the request once with your token chain.
3. Sends later requests for that resource straight to your token until the reset passes, then returns to the app.
4. Notes it once in the debug log (`pr-shepherd admin log-file`).

Secondary (abuse) rate limits never trigger this. If your token is also exhausted, the existing transport fallback (GraphQL to REST) applies as usual. The GitHub API usage section accounts for your token chain and each app separately, so the quota you see for your own token is never mixed with the app's ([Verify](#verify)).

## Identity

Nothing is authored by the app. Because writes and viewer-relative reads use your token, `viewer` is you, `viewerCan*` describes your permissions, replies, resolves, minimizes, dismissals, and mark-ready are yours, and your own review threads are `viewerDidAuthor` threads, exactly as without the app. The `gh` commands Shepherd prints also run under your own `gh` login.

## Verify

Run Shepherd with `--verbose` on a covered repository and read the **GitHub API usage** section. The top-level lines describe only your own token chain (request counts, measured cost, nodes, and the quota sample for each resource). Each app installation that answered gets its own block with the same per-resource lines, because it has its own buckets:

```
- Credential source: `gh auth token`
- `graphql`: 4993/5000 remaining · used 7 · 1 requests · resets 2026-01-01T00:00:00.000Z
- GraphQL measured cost: 7 · unmeasured requests: 0 · nodes: 1500
- `GitHub App 123456 (installation 7890123)`:
  - `graphql`: 9997/10000 remaining · used 3 · 5 requests · resets 2026-01-01T00:00:00.000Z
  - GraphQL measured cost: 5 · unmeasured requests: 0 · nodes: 4000
  - `core`: 14999/15000 remaining · used 1 · 1 requests · resets 2026-01-01T00:00:00.000Z
```

In JSON, `apiUsage.credentialSources`, `graphql`, and `rest` are your token chain only, and `apiUsage.githubApps` is an array with one `{ source, graphql?, rest? }` entry per installation, ordered by first use. It is omitted when no app answered, and `credentialSources` is empty if only an app did. Quota warnings and poll pacing read your token's samples only; the app's own exhaustion is handled by the fallback above. A repository that is not covered shows only its usual source.

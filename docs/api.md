# Programmatic API

[← README](../README.md)

The `pr-shepherd` npm package exports four entry points. `pr-shepherd/journal` is pure and does not read GitHub, resolve tokens, or load configuration.

Install the MCP server: [mcp.md](mcp.md). Classification rules: [configuration.md](configuration.md).

## `pr-shepherd`

```ts
import { createPrShepherd } from "pr-shepherd";

const shepherd = createPrShepherd({ cwd: "/path/to/repo", transport: "auto" });

const tick = await shepherd.iterate({ pr: 42, merge: true });
const group = await shepherd.iterate({ prs: [42, 43] });
const stack = await shepherd.iterate({ stack: 43 });
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
      requireSha: "<40-char lowercase sha>",
    },
  ],
});
const patches = await shepherd.buildSuggestionPatches({
  pr: 42,
  suggestions: [
    { threadId: "PRRT_…", message: "Apply reviewer suggestion" },
    { threadId: "PRRT_…", message: "Apply second suggestion" },
  ],
});
```

`createPrShepherd({ cwd, transport })` returns the canonical methods below plus a deprecated singular adapter. `transport` accepts `auto`, `graphql`, or `rest` and selects the same GitHub API transport as the CLI `--transport` option and `github.transport` configuration key. The MCP server accepts the equivalent option. In `auto`, Claude Code cloud sessions start with REST; other environments start with GraphQL and use the documented fallback triggers. REST fields or operations that are unavailable remain explicit unknowns or surfaced unsupported outcomes.

| Method                                               | Same as                                |
| ---------------------------------------------------- | -------------------------------------- |
| `iterate(input?)`                                    | MCP `iterate` / `pr-shepherd iterate`  |
| `apply({ pr, operations })`                          | MCP `apply`                            |
| `getJournal({ pr })`                                 | MCP `get_journal`                      |
| `buildSuggestionPatches({ pr, suggestions })`        | MCP `build_suggestion_patches`         |
| `buildSuggestionPatch({ pr, threadId, message, … })` | Deprecated one-item compatibility path |

For a singular programmatic API call, `pr` can be a positive number, repository-qualified `owner/repo#N`, or GitHub pull-request URL. `getJournal` requires `pr`; the other methods retain current-branch inference when omitted. A repository-qualified reference is authoritative for GitHub reads and mutations and may name a repository other than the configured `cwd`. `cwd` remains the source of local git state, configuration, classification-rule lookups, and per-worktree debug logging.

`iterate` also accepts exactly one aggregate selector: non-empty `prs` or `stack`. Every selected
reference must resolve to one repository. Aggregate calls perform one compact, read-only summary
tick and return `PollSummaryResult`; they do not mark review items seen, maintain ready-delay state,
or perform GitHub mutations. Native-stack aggregate actions are stack-level `SHEPHERD` for autonomous
unready layers, `WAIT` for queued stacks or layers that can only wait (until an unchanged idle wait reaches `stallTimeoutSeconds` and returns `ESCALATE` with `stall-timeout`), and `CANCEL` for terminal READY or merged state. Every layer that still has work
gets a one-PR Shepherd instruction on that tick. Closed or unverified topology produces `ESCALATE` for human direction only once no
one-PR Shepherd session remains; a mixed state returns `SHEPHERD` and surfaces the human blocker. With `--stack
--merge`, the highest ready prefix whose bottom open layer targets the stack base produces `MERGE`
with `gh stack merge <PR number>` for that prefix; after running it, the caller rechecks
until all layers merge and the stack returns `CANCEL`.
Aggregate selectors never perform mutations or emit rebase/push commands. The caller owns recurrence
and follows the returned instructions.

`apply` runs `operations` in list order after validating every operation. Types: `merge`, `review_mutations`, `mark_files_viewed`, `append_journal`, and `acknowledge_queue_removal`. `merge` requires `requireSha` (a full 40-character lowercase SHA) and `mergeAction` (`direct_merge`, `merge_queue`, or `default`); `mergeMethod` (`merge`, `squash`, or `rebase`) is valid only for `direct_merge`. It requires REST transport, either from the client/API `transport` option or `input.transport`. A merge result carries `{ pr, repo, status, details, uncertain? }`; `status` is `pending`, `enqueued`, `merged`, or `failed`. Pending and enqueued results are not merged. The CLI prints the same result as text or JSON and rerunning the same request resumes its persisted UUID without resubmission. `details` may include `message`, `uuid`, `expected_head_sha`, `merge_action`, `merge_method`, `bypass_rules`, and merged `sha`; `uncertain: true` marks an outcome that needs reconciliation before another request.

A definite failed merge request permits a replacement with changed options. A definite `enqueued` result permits a new request only after the PR head changes and a fresh read verifies the new `requireSha`; pending or uncertain requests cannot be replaced. Repeating the same-head request returns its recorded result rather than enqueueing again. REST cannot verify current merge-queue removal history, so automatic same-head queue recovery is explicitly unsupported and never emits that repeated request as a recovery command. Interrupted local replacements resume their persisted intent safely, while a submission whose outcome is unknown is never repeated.

`mark_files_viewed` performs the requested mutations where the selected transport supports them and surfaces GitHub's per-file results; REST currently reports the operation as explicitly unsupported. Direct review operations forward explicitly supplied IDs without iterate's author, capability, or current-state policy; direct journal operations likewise honor explicit caller intent. GitHub is authoritative for authorization and mutation validity. Replies and dismissals require `message`.

A proxy session refusal stops the current review batch and subsequent `apply` operations. The review result preserves confirmed successes, includes the original proxy message in `sessionRefusal`, and lists pending IDs in the existing `unrepliedThreads`, `unresolvedThreads`, `unminimizedComments`, and `undismissedReviews` fields when nonempty. Its `instructions` array tells the caller to repair session repository access and retry only those pending IDs; any later operations did not run. No GitHub-denied marker is persisted for a session refusal. CLI text/JSON and MCP Markdown/structured output carry the same partial result; the CLI exits `77`.

Retries of an uncertain GraphQL reply reconcile a fresh complete transcript against captured pre-write evidence. An exact confirmed reply is adopted without resubmission and remains available across subsequent batch failures. Unconfirmed or legacy intents expose targeted marker-file recovery instructions; see [uncertain reply recovery](comments.md#recovering-an-uncertain-reply).

`getJournal({ pr })` fetches one PR body through the selected transport and returns the same typed result as
`extractShepherdJournal(body)` without exposing the body or PR node ID. The API accepts a qualified
reference or a numeric PR in the configured checkout repository. An absent journal returns
`{ ok: true, journal: null }`; malformed journal content returns `{ ok: false, error }`.

Validation failures throw `PrShepherdValidationError` before any GitHub mutation. If a later apply operation fails after earlier ones succeeded, Shepherd throws `PartialApplyError` with `failedIndex` and `completed`.

`buildSuggestionPatches` returns an ordered patch list plus per-patch commit metadata and shared instructions. It accepts one or more `{ threadId, message, description? }` items, builds against the fetched PR-head blobs, permits a clean local descendant of that head, and returns nothing unless the ordered stream passes `git apply --check`. It never writes a patch file or mutates git. `buildSuggestionPatch` remains temporarily as a deprecated one-item adapter.

`acknowledge_queue_removal` requires `requireSha` (the full current head SHA), `queueCommitOid` (the full removed queue commit SHA), and `removedAtUnix` (a positive safe-integer Unix timestamp). It validates the current native-stack CI removal before recording a local acknowledgment; it does not enqueue or merge. REST cannot verify this removal history and returns an explicit transport-unsupported error before GitHub I/O. The result contains `pr`, `repo`, and `acknowledgment` with `headSha`, `queueCommitOid`, and `removedAtUnix`. Fresh source checks, a current READY receipt, and aggregate lower-layer checks remain required for stack recovery.

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

`extractShepherdJournal(body)` returns the one visible structural journal as
`{ ok: true, journal: { format, entries } }`, or `{ ok: true, journal: null }` when none exists.
Each entry retains its leading hyphen-and-space marker and continuation indentation, with line endings
normalized to LF. Empty journals return `entries: []`; malformed, duplicate, mixed, nested, or
unrecognized journal content returns `{ ok: false, error }`. Journal-shaped examples inside fenced
code, comments, raw HTML, quotes, and list containers are ignored.

`reconcileShepherdJournal(suppliedBody, liveBody)` ensures a supplied body preserves every live Shepherd Journal item. If the supplied body omits a non-empty live journal, the function appends that container verbatim. It fails closed for malformed, duplicate, ambiguous, or canonical-to-legacy-downgrade containers. Its discriminated result is `{ ok: true, body } | { ok: false, error }`.

`appendJournalItem` creates or migrates the canonical details container and idempotently appends one item. `validateJournalItem` returns a discriminated validation result for a `- <text>` journal item. Both functions are pure.

## `pr-shepherd/mcp`

```ts
import { createPrShepherdMcpServer, runPrShepherdMcpStdio } from "pr-shepherd/mcp";

const server = createPrShepherdMcpServer({ cwd: "/path/to/repo" });
await runPrShepherdMcpStdio({ cwd: "/path/to/repo" });
```

`createPrShepherdMcpServer` accepts an optional `shepherd` for tests. The public factory exposes `iterate`, `apply`, `build_suggestion_patches`, `extract_journal`, and `get_journal` plus the deprecated singular adapter. MCP tools that target a PR require a repository-qualified reference; `iterate` accepts exactly one of `pr`, `prs`, or `stack`, while the other PR-targeted tools require `pr`. `extract_journal` instead requires only a Markdown `body` string and performs no GitHub, file, stdin, or Shepherd-log I/O. Bare and omitted PR references are rejected by PR-targeted tools. The explicit repository is the GitHub target and may differ from the factory's `cwd`, which still supplies the local git/config/rules context. Host install and tool schemas: [mcp.md](mcp.md).

`createPrShepherd().iterate()` returns the raw `IterateResult` for a singular selector and a raw `PollSummaryResult` for aggregate `prs` or `stack` selectors. For singular MCP `iterate`, `structuredContent` is instead the lean JSON projection described in [mcp.md](mcp.md), matching CLI `--format=json`; aggregate MCP `structuredContent` remains the raw `PollSummaryResult`.

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

Drop rule files under `.pr-shepherd/classification/`. `ClassifyItem` includes `kind`, `id`, `author`, `authorType`, optional `authorAssociation`, and `body`. Loading rules and `suppress` / `autoResolve` behavior: [configuration.md](configuration.md).

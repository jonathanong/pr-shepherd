# Programmatic API

[← README](../README.md)

The `pr-shepherd` npm package exports four entry points. `pr-shepherd/journal` is pure and does not read GitHub, resolve tokens, or load configuration.

Install the MCP server: [mcp.md](mcp.md). Classification rules: [configuration.md](configuration.md).

## `pr-shepherd`

```ts
import { createPrShepherd } from "pr-shepherd";

const shepherd = createPrShepherd({ cwd: "/path/to/repo" });

const tick = await shepherd.iterate({ pr: 42 });
const applied = await shepherd.apply({
  pr: 42,
  operations: [
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

`createPrShepherd({ cwd })` returns the canonical methods below plus a deprecated singular adapter:

| Method                                               | Same as                                |
| ---------------------------------------------------- | -------------------------------------- |
| `iterate(input?)`                                    | MCP `iterate` / `pr-shepherd iterate`  |
| `apply({ pr, operations })`                          | MCP `apply`                            |
| `buildSuggestionPatches({ pr, suggestions })`        | MCP `build_suggestion_patches`         |
| `buildSuggestionPatch({ pr, threadId, message, … })` | Deprecated one-item compatibility path |

For the programmatic API, `pr` is an optional positive number, repository-qualified `owner/repo#N`, or GitHub pull-request URL. Omitted, Shepherd infers the current branch's open PR. Repository-qualified references must match the repository at the configured `cwd` (or process working directory when omitted). `cwd` is used for git, config, and classification-rule lookups.

`apply` runs `operations` in list order after validating every operation. Types: `review_mutations`, `mark_files_viewed`, `append_journal`. Replies and dismissals require `message`. `requireSha` must be a full 40-character lowercase hex SHA.

Validation failures throw `PrShepherdValidationError` before any GitHub mutation. If a later apply operation fails after earlier ones succeeded, Shepherd throws `PartialApplyError` with `failedIndex` and `completed`.

`buildSuggestionPatches` returns an ordered patch list plus per-patch commit metadata and shared instructions. It accepts one or more `{ threadId, message, description? }` items, builds against the fetched PR-head blobs, permits a clean local descendant of that head, and returns nothing unless the ordered stream passes `git apply --check`. It never writes a patch file or mutates git. `buildSuggestionPatch` remains temporarily as a deprecated one-item adapter.

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

`createPrShepherdMcpServer` accepts an optional `shepherd` for tests. The public factory exposes canonical `iterate`, `apply`, and `build_suggestion_patches` tools plus the deprecated singular adapter. Unlike `createPrShepherd`, every MCP tool call requires a repository-qualified `pr` — a GitHub PR URL or `owner/repo#N` — matching the factory's `cwd`; bare and omitted PR references are rejected. Host install and tool schemas: [mcp.md](mcp.md).

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

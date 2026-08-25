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
const patch = await shepherd.buildSuggestionPatch({
  pr: 42,
  threadId: "PRRT_…",
  message: "Apply reviewer suggestion",
});
```

`createPrShepherd({ cwd })` returns three methods — the same operations as the MCP tools:

| Method                                                          | Same as                               |
| --------------------------------------------------------------- | ------------------------------------- |
| `iterate(input?)`                                               | MCP `iterate` / `pr-shepherd iterate` |
| `apply({ pr, operations })`                                     | MCP `apply`                           |
| `buildSuggestionPatch({ pr, threadId, message, description? })` | MCP `build_suggestion_patch`          |

`pr` is an optional positive number or GitHub pull-request URL. Omitted, Shepherd infers the current branch's open PR. `cwd` is used for git, config, and classification-rule lookups.

`apply` runs `operations` in list order after validating every operation. Types: `review_mutations`, `mark_files_viewed`, `append_journal`. Replies and dismissals require `message`. `requireSha` must be a full 40-character lowercase hex SHA.

Validation failures throw `PrShepherdValidationError` before any GitHub mutation. If a later apply operation fails after earlier ones succeeded, Shepherd throws `PartialApplyError` with `failedIndex` and `completed`.

`buildSuggestionPatch` returns a unified diff plus commit metadata. It does not write a patch file or mutate git. It rejects when the suggestion does not safely fit GitHub's anchored range; callers should inspect the surrounding source and reviewer intent and apply that review manually.

## `pr-shepherd/journal`

```ts
import {
  appendJournalItem,
  reconcileShepherdJournal,
  validateJournalItem,
} from "pr-shepherd/journal";

const result = reconcileShepherdJournal(suppliedBody, liveBody);
if (!result.ok) throw new Error(result.error);

const validation = validateJournalItem("- Kept the existing behavior.");
if (validation.ok) appendJournalItem(result.body, validation.item);
```

`reconcileShepherdJournal(suppliedBody, liveBody)` ensures a supplied body preserves every live Shepherd Journal item. If the supplied body omits a non-empty live journal, the function appends that container verbatim. It fails closed for malformed, duplicate, ambiguous, or canonical-to-legacy-downgrade containers. Its discriminated result is `{ ok: true, body } | { ok: false, error }`.

`appendJournalItem` creates or migrates the canonical details container and idempotently appends one item. `validateJournalItem` returns a discriminated validation result for a `- <text>` journal item. Both functions are pure.

## `pr-shepherd/mcp`

```ts
import { createPrShepherdMcpServer, runPrShepherdMcpStdio } from "pr-shepherd/mcp";

const server = createPrShepherdMcpServer({ cwd: "/path/to/repo" });
await runPrShepherdMcpStdio({ cwd: "/path/to/repo" });
```

`createPrShepherdMcpServer` accepts an optional `shepherd` for tests. The public factory still only exposes `iterate`, `apply`, and `build_suggestion_patch`. Host install and tool schemas: [mcp.md](mcp.md).

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

# shepherd — extending

[← README](../README.md) | [architecture.md](architecture.md)

Step-by-step recipes for contributors adding a subcommand, action, check category, mutation, or config constant. Paths are relative to `src/`; see [architecture.md](architecture.md) for module boundaries.

## Recipe 0: Add a new subcommand

1. **Implement it** in `commands/<name>.mts` and wire a handler into `cli-parser.mts`.
2. **Add help** — add a `COMMAND_USAGE` entry in `cli/help-command-pages.mts`, then start the handler with `if (maybePrintHelp(args, "<key>")) return;` so `--help`/`-h` prints usage and exits 0 before any I/O or validation.
3. **Expose it** through `api.mts` and `mcp/server.mts` if agents need it, keeping MCP `structuredContent` and Markdown content on the same projection.
4. **Document it** in [cli-usage.md](cli-usage.md) (and [mcp.md](mcp.md) for a new tool).

## Recipe 1: Add a new action

1. **Add the type** — in `types/iterate.mts`, add to the `ShepherdAction` union:

   ```ts
   export type ShepherdAction = 'wait' | ... | 'my_action'
   ```

2. **Add the result interface** — in `types/iterate.mts`, then add it to the `IterateResult` union:

   ```ts
   export interface IterateResultMyAction extends IterateResultBase {
     action: "my_action";
     myField: string;
   }
   ```

3. **Add the dispatch step** — in `commands/iterate/index.mts` (`runIterateCore`), insert the new step in the decision chain and return the new result shape. Keep [iterate-flow.md](iterate-flow.md) in sync.
4. **Map the exit code** — add a case to `iterateResultToExitCode` in `exit-codes.mts` and update [exit-codes.md](exit-codes.md).
5. **Add the formatter** — in `cli/iterate-formatter.mts`, add a `case "my_action":` branch that emits the body and a numbered `## Instructions` section, plus the lean JSON projection in `cli/iterate-lean.mts`. The skill follows those steps verbatim, so `plugins/pr-shepherd/skills/pr-shepherd/SKILL.md` needs no change.
6. **Document the output** in [actions.md](actions.md) in the same PR — it is the canonical spec for iterate output.
7. **Add tests** — a `commands/iterate.<topic>.mock.test.mts` file with a `describe('runIterate — my_action')` block, plus a `test-cases/fixtures/` scenario with JSON and Markdown snapshots.

## Recipe 2: Add a new check classifier category

1. **Add the type** — in `types/check-classification.mts`, add to the `CheckCategory` union:

   ```ts
   type CheckCategory = 'passed' | 'failing' | ... | 'my_category'
   ```

2. **Add the classification branch** — in `checks/classify.mts`, add a branch in the per-check `classify` function used by `classifyChecks`:

   ```ts
   if (someCondition(check)) return { ...check, category: "my_category" };
   ```

3. **Update `getCiVerdict`** — decide whether the category counts as failing, in-progress, or neither.
4. **Add tests** in `checks/classify.test.mts`.

## Recipe 3: Add a new mutation

1. **Add the GraphQL file** — `github/gql/my-mutation.gql`.
2. **Add the loader** — in `github/queries.mts`:

   ```ts
   export const myMutation = gql("my-mutation.gql");
   ```

3. **Add the function** — in `comments/resolve.mts`, an exported function that calls the mutation via `graphqlWithRateLimit` (from `github/client.mts`).
4. **Handle REST** — add the REST path (see `comments/rest-review-mutations.mts`) or throw `UnsupportedRestOperationError` from `github/unsupported-rest.mts`, so REST mode surfaces an explicit unsupported result instead of silently skipping. See [api.md](api.md).
5. **Add to `ResolveOptions`** in `types/report.mts` if `apply review` options trigger it.
6. **Add tests** — `comments/resolve.<topic>.mock.test.mts`.

## Recipe 4: Change tunable constants

Defaults live in `src/config.json`; do not hardcode values in `.mts` files. Add the key's type to `PrShepherdConfig` and validation in `config/load.mts`, and document it in [configuration.md](configuration.md).

Read config through `loadConfig()` from `src/config/load.mts`, never by importing `config.json` directly, so cascading `.pr-shepherdrc.yml` overrides apply.

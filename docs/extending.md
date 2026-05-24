# shepherd — extending

[← README](../README.md) | [architecture.md](architecture.md)

Four recipes for common extension patterns.

---

## Recipe 1: Add a new action

1. **Add the type** — in `types/iterate.mts`, add to the `ShepherdAction` union:

   ```ts
   export type ShepherdAction = 'wait' | ... | 'my_action'
   ```

2. **Add the result interface** — in `types/iterate.mts`, add:

   ```ts
   export interface IterateResultMyAction extends IterateResultBase {
     action: "my_action";
     myField: string;
   }
   ```

   Add it to the `IterateResult` union.

3. **Add the dispatch step** — in `commands/iterate/index.mts`, insert a new numbered step in the decision chain. Return the new result shape.

4. **Add the formatter** — in `cli/iterate-formatter.mts`, add a `case "my_action":` branch that emits the action-specific body and a numbered `## Instructions` section. The iterate skill follows those steps verbatim — no changes to `skills/pr-shepherd/SKILL.md` are required.

5. **Add tests** — in `commands/iterate.mock.test.mts`, add a `describe('runIterate — my_action')` block.

---

## Recipe 2: Add a new check classifier category

1. **Add the type** — in `types.mts`, add to the `CheckCategory` union:

   ```ts
   export type CheckCategory = 'passed' | 'failing' | ... | 'my_category'
   ```

2. **Add the classification branch** — in `checks/classify.mts`, add a branch in the `classifyCheck` function:

   ```ts
   if (someCondition(check)) return { ...check, category: "my_category" };
   ```

3. **Update `getCiVerdict`** — decide whether the new category counts as failing, in-progress, or neither.

4. **Add tests** — in `checks/classify.test.mts`, add test cases covering the new category.

---

## Recipe 3: Add a new mutation

1. **Add the GraphQL file** — create `src/github/gql/my-mutation.gql` with the mutation string.

2. **Add the loader** — in `github/queries.mts`, load and export the new mutation:

   ```ts
   export const myMutation = gql("my-mutation.gql");
   ```

3. **Add the function** — in `comments/resolve.mts`, add a new exported function that calls the mutation via `graphqlWithRateLimit`.

4. **Add to `ResolveOptions`** — if the mutation is triggered by `resolve` command options, add the relevant field to `ResolveOptions` in `types/report.mts`.

5. **Add tests** — in `comments/resolve.mock.test.mts`, add test cases.

---

## Recipe 4: Change tunable constants

All tunable constants live in `src/config.json`. Edit there — do not hardcode values in `.mts` source files.

```json
{
  "iterate": {
    "fixAttemptsPerThread": 3,
    "stallTimeoutMinutes": 60,
    "minimizeApprovals": false,
    "minimizeComments": "all"
  },
  "watch": { "readyDelayMinutes": 10 },
  "resolve": {
    "shaPoll": { "maxAttempts": 10, "intervalMs": 2000 }
  }
}
```

Modules that need config should call `loadConfig()` from `src/config/load.mts` rather than importing `config.json` directly. This ensures `.pr-shepherdrc.yml` overrides are honoured.

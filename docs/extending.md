# shepherd — extending

[← README.md](README.md) | [architecture.md](architecture.md)

Four recipes for common extension patterns.

---

## Recipe 1: Add a new action

1. **Add the type** — in `types.mts`, add to the `ShepherdAction` union:

   ```ts
   export type ShepherdAction = 'cooldown' | 'wait' | ... | 'my_action'
   ```

2. **Add the result interface** — in `types.mts`, add:

   ```ts
   export interface IterateResultMyAction extends IterateResultBase {
     action: 'my_action'
     myField: string
   }
   ```

   Add it to the `IterateResult` union.

3. **Add the dispatch step** — in `commands/iterate.mts`, insert a new numbered step in the decision chain. Return the new result shape.

4. **Add the cron prompt handler** — in `skills/monitor/SKILL.md`, add a new bullet inside the CronCreate prompt for the new `action` value:

   ```
   - `my_action` → log: `MY_ACTION: <relevant info>`
   ```

5. **Add tests** — in `commands/iterate.mock.test.mts`, add a `describe('runIterate — my_action')` block.

---

## Recipe 2: Add a new check classifier category

1. **Add the type** — in `types.mts`, add to the `CheckCategory` union:

   ```ts
   export type CheckCategory = 'passed' | 'failing' | ... | 'my_category'
   ```

2. **Add the classification branch** — in `checks/classify.mts`, add a branch in the `classifyCheck` function:

   ```ts
   if (someCondition(check)) return { ...check, category: 'my_category' }
   ```

3. **Update `getCiVerdict`** — decide whether the new category counts as failing, in-progress, or neither.

4. **Add tests** — in `checks/classify.test.mts`, add test cases covering the new category.

---

## Recipe 3: Add a new mutation

1. **Add the GraphQL file** — create `src/github/gql/my-mutation.gql` with the mutation string.

2. **Add the loader** — in `github/queries.mts`, load and export the new mutation:

   ```ts
   export const myMutation = loadGql('my-mutation.gql')
   ```

3. **Add the function** — in `comments/resolve.mts`, add a new exported function that calls the mutation via `graphqlWithRateLimit`.

4. **Add to `ResolveOptions`** — if the mutation is triggered by `resolve` command options, add the relevant field to `ResolveOptions` in `types.mts`.

5. **Add tests** — in `comments/resolve.mock.test.mts`, add test cases.

---

## Recipe 4: Change tunable constants

All tunable constants live in `src/config.json`. Edit there — do not hardcode values in `.mts` source files.

```json
{
  "cache": { "ttlSeconds": 300 },
  "iterate": { "cooldownSeconds": 30 },
  "watch": { "intervalMinutesDefault": 4, "readyDelayMinutesDefault": 10 },
  "checks": { "logExcerptLines": 50 },
  "resolve": { "maxAttempts": 10, "pollIntervalMs": 3000 }
}
```

The `config.json` is imported using `with { type: 'json' }` in the files that need it.

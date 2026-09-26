# Bot-comment classifiers

Use a classification rule when the unwanted item has a recognizable author and message pattern. Inspect a representative item first so the rule does not hide other feedback from the same bot. Prefer an existing settings control for polling- or output-wide behavior.

Place an `.mts` file in `.pr-shepherd/classification/` in the project. Shepherd uses the first classification directory on the working directory's ancestor chain; it stops at the home directory if reached, otherwise at the filesystem root. A home-level rule directory is not discovered when the project is outside the home tree. Rule directories do not merge. Files ending in `.ts`, `.mts`, `.mjs`, or `.js` load, except names beginning with `_` or `.`. An `.mts` rule can use erasable TypeScript syntax and `import type`, without transpilation-only features such as enums.

Each file default-exports a `ClassifyRule` from `pr-shepherd/classify`. A rule receives one of `review-thread`, `pr-comment`, `review-summary`, or `changes-requested`, with `author`, `authorType`, `body`, `id`, and optional `url` or thread `path`. Match the observed `kind`, login, and distinctive body text. For example:

```ts
import type { ClassifyRule } from "pr-shepherd/classify";

const rule: ClassifyRule = (item) => {
  if (item.kind !== "pr-comment" && item.kind !== "review-summary") return null;
  if (item.author.toLowerCase() !== "gemini-code-assist") return null;
  if (!/^You have reached your daily quota limit\b/i.test(item.body)) return null;
  return { suppress: true };
};

export default rule;
```

`suppress: true` removes a matched item from agent output. Add `autoResolve: true` only when the requested policy also calls for resolving its thread or minimizing its comment or review summary. It is unsupported for `changes-requested` reviews, whose dismissal needs a message. Optional `reason` is the note printed, reported, and journaled when the rule fires. With both flags, `actions.autoMinimizeSuppressed: true` (the default) lets Shepherd perform the authorized mutation, then print a `## Classification auto-resolve` line, record `threads.autoResolved` / `comments.autoMinimized`, and append one Shepherd Journal item for the token login. Failed IDs stay on the generated `apply review` command and the failure is listed under that line. Set `actions.autoMinimizeSuppressed: false` to keep the handoff without mutating, journaling, or printing the line. When GitHub does not confirm capability, the item returns to normal first-look visibility. Matching rules combine their flags and keep every non-empty reason, so inspect existing rules before adding one.

Exercise the exported rule against the observed item and negative examples: a different author, kind, and substantive message from the same bot. Confirm only the intended item matches before enabling automatic resolution. After editing a rule, restart a persistent MCP server or long-running poll process; it caches loaded rule modules. A new CLI process loads the change. A classifier does not retroactively remove already displayed output.

# Bot-comment classifiers

Use a classification rule when the unwanted item has a recognizable author and message pattern. Inspect a representative item first so the rule does not hide other feedback from the same bot. Prefer an existing settings control for polling- or output-wide behavior.

Check the bundled rules first. Under `classify.standard` in the active config file, `all: true` enables every rule, and a named boolean such as `codecov-report: false` overrides `all`. They cover vendor bot notices on conversation comments (`claude-notices`, `coderabbit-notices`, `codecov-report`, `codex-notices`, `dependabot-notices`, `dependency-review-no-issues`, `gemini-notices`, `kilo-no-issues`, `snyk-no-issues`, `socket-reports`, `sonarqube-gate-passed`, `sourcery-notices`, and `sourcery-review-guide`), and `coderabbit-notices` also suppresses CodeRabbit chat rate-limit replies on review threads (`review-thread-reply`, suppress-only). They do not match review summaries or review-thread root comments. Write a custom rule only when no bundled rule fits. If a name here is rejected as unknown, this list is stale for the installed version; trust the error.

Place an `.mjs` file in `.pr-shepherd/classification/` in the project. Shepherd uses the first classification directory on the working directory's ancestor chain; it stops at the home directory if reached, otherwise at the filesystem root. A home-level rule directory is not discovered when the project is outside the home tree. Rule directories do not merge. Files ending in `.ts`, `.mts`, `.mjs`, or `.js` load, except names beginning with `_` or `.`. Prefer `.mjs`; an `.mts` rule also works if it uses only erasable TypeScript syntax.

Each file default-exports a `ClassifyRule` from `pr-shepherd/classify`. A rule receives one of `review-thread`, `review-thread-reply`, `pr-comment`, `review-summary`, or `changes-requested`, with `author`, `authorType`, `body`, `id`, optional `url` or thread `path`, and `threadId` on `review-thread-reply`. Match the observed `kind`, login, and distinctive body text. For example:

```js
/** @type {import("pr-shepherd/classify").ClassifyRule} */
const rule = (item) => {
  if (item.kind !== "pr-comment") return null;
  if (item.author.toLowerCase() !== "gemini-code-assist") return null;
  if (!/^You have reached your daily quota limit\b/i.test(item.body)) return null;
  return { suppress: true };
};

export default rule;
```

`suppress: true` removes a matched item from agent output (on `review-thread-reply`, only that reply is removed from the thread). Add `autoResolve: true` only when the requested policy also calls for resolving its thread or minimizing its comment or review summary. It is unsupported for `changes-requested` reviews (whose dismissal needs a message) and `review-thread-reply` items. Optional `reason` is printed and reported when the rule fires. With both flags, `actions.auto-minimize-suppressed: true` (the default) lets Shepherd perform the authorized mutation, then print a `## Classification auto-resolve` line and record `threads.autoResolved` / `comments.autoMinimized`. It does not append to the Shepherd Journal. Journal notes are optional agent-authored updates made only through an explicit `apply journal` call. Failed IDs stay on the generated `apply review` command and the failure is listed under that line. Set `actions.auto-minimize-suppressed: false` to keep the handoff without mutating or printing the line. When GitHub does not confirm capability, the item returns to normal first-look visibility. Matching rules combine their flags and keep every non-empty reason, so inspect existing rules before adding one.

Exercise the exported rule against the observed item and negative examples: a different author, kind, and substantive message from the same bot. Confirm only the intended item matches before enabling automatic resolution. After editing a rule, restart any long-running poll process; it caches loaded rule modules. A new CLI process loads the change. A classifier does not retroactively remove already displayed output.

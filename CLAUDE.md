# Development

## Setup

After cloning or creating a new worktree, run:

```bash
npm install && npm run build
```

The `bin/` directory is gitignored and must be built before `npx pr-shepherd` works.

If no `core.hooksPath` is already configured in the local repo config, `npm install` registers `.githooks/pre-push` (lint + typecheck) via `git config core.hooksPath .githooks`. If `core.hooksPath` is already set locally, the install step is skipped and your existing hooks path takes precedence. Bypass with `git push --no-verify`.

## Output format invariant

`--format=json` and `--format=text` (default) must surface equivalent information. Every field exposed in JSON output should have a corresponding representation in text output, and vice versa. Do not add data to one format without updating the other.

## Dogfooding

During development, run the CLI from this repository root with `npx pr-shepherd` (after `npm install && npm run build`).
This ensures you are using the built local CLI from this checkout rather than any globally installed version.
Use it from the same worktree/repository so it picks up the skills and configuration checked into this local checkout.

## Documentation

When making changes, review [`docs/`](docs/) and [`README.md`](README.md) for impact. Update them when the change affects user-facing behavior, commands, configuration, or workflows so the documentation stays in sync as part of the same change, not as a follow-up. If no documentation updates are needed, it is OK to leave them unchanged (optionally noting `docs: n/a`).

`docs/actions.md` is the canonical spec for `shepherd iterate` output — the monitor SKILL and agent consumers read the `## Instructions` sections and section structure directly. Any change to iterate action output (new triggers, new sections, new instruction variants, JSON field moves) must land together with the matching `docs/actions.md` edit in the same PR. If you change the CLI's output shape without updating the doc, the skill silently drifts.

## Markdown output readability

CLI output that targets a human or an AI agent must be easy to read and act on:

- Every heading (`##`, `###`) is followed by a blank line before its body.
- Each independently actionable item goes on its own line — use a bullet list or a numbered list. Do not chain multiple action items together on one line with `·`, `,`, or `;`. Informational summaries, status rollups, and ID lists that are meant to be scanned rather than acted on item-by-item may stay inline if they remain easy to read. (The base/summary status lines in `formatIterateResult` are a dashboard meant to be scanned at a glance, not acted on individually — those are exempt.)
- Long output is acceptable. Prefer clarity over brevity for instructions and other content the reader is expected to act on.
- When the output tells the reader to do something, phrase it as explicit, numbered steps.

## Keep skills and loop prompts minimal

Skills (`plugin/skills/*/SKILL.md`) and `/loop` prompts should be thin dispatchers with this shape:

1. Parse arguments.
2. Short-circuit trivial cases (e.g. merged PR).
3. Invoke the CLI.
4. Print the full output.
5. Follow the output's own `## Instructions` section exactly.

The canonical example is `plugin/skills/resolve/SKILL.md` — 37 lines, pure dispatcher, no policy.

Everything else belongs in the CLI's Markdown `## Instructions` output, not in the skill:

- Per-action dispatch (which command to extract, which tool to call, what variant to run).
- **Interpretation and policy tables keyed on CLI output shape** — enum meanings (e.g. what `CONFLICTS` means for rebase), CI budget rules (`failureKind` handling, rerun commands), ready-to-merge predicates, field-by-field reporting templates.
- Any instruction the reader is expected to act on.

Rule of thumb: if a skill contains a table, policy, or interpretation block whose inputs come from CLI output fields, that content belongs in the CLI's `## Instructions` section instead.

Skills must not link to files outside the `plugin/` directory (such as `docs/**` or `README.md`). Those files are not included in the published plugin and will be dead links for consumers. All information a skill consumer needs must come from the CLI output itself or be written inline in the skill.

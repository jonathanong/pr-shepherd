# Development

## Setup

After cloning or creating a new worktree, run:

```bash
npm install && npm run build
```

The `bin/` directory is gitignored and must be built before `npx pr-shepherd` works.

## Output format invariant

`--format=json` and `--format=text` (default) must surface equivalent information. Every field exposed in JSON output should have a corresponding representation in text output, and vice versa. Do not add data to one format without updating the other.

## Dogfooding

During development, run the CLI from this repository root with `npx pr-shepherd` (after `npm install && npm run build`).
This ensures you are using the built local CLI from this checkout rather than any globally installed version.
Use it from the same worktree/repository so it picks up the skills and configuration checked into this local checkout.

## Documentation

When making changes, review [`docs/`](docs/) and [`README.md`](README.md) for impact. Update them when the change affects user-facing behavior, commands, configuration, or workflows so the documentation stays in sync as part of the same change, not as a follow-up. If no documentation updates are needed, it is OK to leave them unchanged (optionally noting `docs: n/a`).

## Markdown output readability

CLI output that targets a human or an AI agent must be easy to read and act on:

- Every heading (`##`, `###`) is followed by a blank line before its body.
- Each independently actionable item goes on its own line — use a bullet list or a numbered list. Do not chain multiple action items together on one line with `·`, `,`, or `;`. Informational summaries, status rollups, and ID lists that are meant to be scanned rather than acted on item-by-item may stay inline if they remain easy to read. (The base/summary status lines in `formatIterateResult` are a dashboard meant to be scanned at a glance, not acted on individually — those are exempt.)
- Long output is acceptable. Prefer clarity over brevity for instructions and other content the reader is expected to act on.
- When the output tells the reader to do something, phrase it as explicit, numbered steps.

## Keep skills and loop prompts minimal

Skills (`plugin/skills/*/SKILL.md`) and `/loop` prompts should be thin dispatchers: parse inputs, invoke the CLI, print the output, then follow the output's own `## Instructions` section.

Per-action dispatch logic — which command to extract, which tool to call, what variant to run, substitution rules — belongs in the CLI's Markdown output as a `## Instructions` section, not in the skill or the loop prompt.

Rule of thumb: if a skill or loop prompt contains a dispatch table keyed on CLI output shape, that table should live in the CLI's output instead.

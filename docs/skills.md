# pr-shepherd skills

[← README](../README.md)

Two skills are shipped for both Claude Code and Codex:

- `pr-shepherd` is a thin poll dispatcher — it runs the default `pr-shepherd <PR>` command with a bounded interval/timeout and follows the `## Instructions` embedded in the output. All policy, state transitions, and per-action guidance live in the CLI output, not in the skill.
- `mark-files-as-viewed` marks PR changed files as viewed in GitHub by invoking `pr-shepherd mark-files-as-viewed`.

## Claude Code

Install the plugin:

```bash
claude /plugin marketplace add jonathanong/pr-shepherd
claude /plugin install pr-shepherd
```

Use the skill inside a `/goal`:

```
/goal /pr-shepherd:pr-shepherd        # infer PR from current branch
/goal /pr-shepherd:pr-shepherd 42
/pr-shepherd:mark-files-as-viewed 42 tests
```

The goal loop handles recurrence. The skill invokes the default poll dispatcher and prints the output. For non-terminal actions, follow the CLI's `## Instructions`, then invoke the skill again. `[CANCEL]` and `[ESCALATE]` stop the goal.

## Codex

Install the Codex plugin marketplace from GitHub:

```sh
codex plugin marketplace add jonathanong/pr-shepherd
```

Or pin a branch/tag/ref:

```sh
codex plugin marketplace add jonathanong/pr-shepherd --ref main
```

For local development, point Codex at a checkout:

```sh
git clone https://github.com/jonathanong/pr-shepherd ~/.codex/plugin-sources/pr-shepherd
codex plugin marketplace add ~/.codex/plugin-sources/pr-shepherd
```

After adding the marketplace, open the Codex plugin directory, choose the `jonathanong` marketplace, and install/enable `pr-shepherd`.

Then make the CLI available in the repository where Codex will work.

Use the skill inside a `/goal`:

```
/goal $pr-shepherd        # infer PR from current branch
/goal $pr-shepherd 42
$mark-files-as-viewed 42 tests
```

Codex runs the same skill: invoke the default poll dispatcher, follow the output, and continue until `[CANCEL]` or `[ESCALATE]`.

## Resolve without iterating

To fix review comments without starting a full iterate loop, run `pr-shepherd resolve` directly:

```bash
pr-shepherd resolve <N> --fetch
```

Follow the `## Instructions` in the output. The `fix_code` action emits the exact `resolve` command to run after pushing fixes — so a full `pr-shepherd` iterate tick also covers resolve.

## Mark files as viewed

To hide already-reviewed files in GitHub's PR diff:

```bash
pr-shepherd mark-files-as-viewed <N> --tests
pr-shepherd mark-files-as-viewed <N> src/a.ts --match '^docs/'
```

The `mark-files-as-viewed` skill treats a standalone `tests` argument as `--tests`; exact file paths and explicit `--match <regex>` selectors are passed through.

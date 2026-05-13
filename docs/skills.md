# pr-shepherd skills

[← README](../README.md)

One skill is shipped for both Claude Code and Codex: `pr-shepherd`. It is a thin one-tick dispatcher — it runs `<runner> pr-shepherd <PR>` and follows the `## Instructions` embedded in the output. All policy, state transitions, and per-action guidance live in the CLI output, not in the skill.

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
/goal /pr-shepherd:pr-shepherd 42 --ready-delay 15m
```

The goal loop handles recurrence. Each tick the skill runs one iterate cycle and prints the output. For non-terminal actions, the CLI's `## Instructions` tell Claude to schedule exactly one next session-only iteration after a fresh 30s-4m delay and end the turn. Claude should not sleep inline or create a recurring cron. `[CANCEL]` and `[ESCALATE]` stop the goal.

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

Then install the CLI in the repository where Codex will work:

```sh
pnpm add -D pr-shepherd      # pnpm repos
yarn add -D pr-shepherd      # yarn repos
npm install --save-dev pr-shepherd
```

Use the skill inside a `/goal`:

```
/goal $pr-shepherd        # infer PR from current branch
/goal $pr-shepherd 42
```

Codex runs the same skill — one tick per goal iteration. The CLI detects Codex via `CODEX_CI=1` or `AGENT=codex` and adapts its `## Instructions` wording so Codex sleeps inline for a fresh 30s-4m delay before rerunning. If Codex is not already setting `CODEX_CI=1`, set `AGENT=codex` before invoking the CLI:

```sh
export AGENT=codex
```

## Resolve without iterating

To fix review comments without starting a full iterate loop, run `pr-shepherd resolve` directly:

```bash
<runner> pr-shepherd resolve <N> --fetch
```

Follow the `## Instructions` in the output. The `fix_code` action emits the exact `resolve` command to run after pushing fixes — so a full `pr-shepherd` iterate tick also covers resolve.

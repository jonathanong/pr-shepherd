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

The goal loop handles recurrence. Each tick the skill runs one iterate cycle and prints the output. For non-terminal actions, the CLI's `## Instructions` nudge the iteration strategy. Pick one:

- **Scheduled wakeup** (recommended for Claude) — schedule exactly one next session-only iteration after a fresh 30s–4m delay, then end the turn.
- **Blocking poll** — run `<runner> pr-shepherd poll <N>` to loop internally until a non-WAIT action appears (bounded by `--timeout`, default 5m).
- **Inline sleep** (Codex default) — sleep inline for a fresh 30s–4m delay, then rerun.

Do not combine strategies and do not run `while true` or unbounded polling loops outside of `pr-shepherd poll`. `[CANCEL]` and `[ESCALATE]` stop the goal regardless of strategy.

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
bun add -d pr-shepherd       # bun repos
npm install --save-dev pr-shepherd
```

Use the skill inside a `/goal`:

```
/goal $pr-shepherd        # infer PR from current branch
/goal $pr-shepherd 42
```

Codex runs the same skill — one tick per goal iteration. The CLI detects Codex via `CODEX_CI=1` or `AGENT=codex` and adapts its `## Instructions` wording to prefer inline sleep before rerunning. Alternatively, Codex can run `<runner> pr-shepherd poll <N>` to block until a non-WAIT action appears. If Codex is not already setting `CODEX_CI=1`, set `AGENT=codex` before invoking the CLI:

```sh
export AGENT=codex
```

## Resolve without iterating

To fix review comments without starting a full iterate loop, run `pr-shepherd resolve` directly:

```bash
<runner> pr-shepherd resolve <N> --fetch
```

Follow the `## Instructions` in the output. The `fix_code` action emits the exact `resolve` command to run after pushing fixes — so a full `pr-shepherd` iterate tick also covers resolve.

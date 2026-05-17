# pr-shepherd skills

[← README](../README.md)

One skill is shipped for both Claude Code and Codex: `pr-shepherd`. It is a thin poll dispatcher — it runs `<runner> pr-shepherd poll <PR>` and follows the `## Instructions` embedded in the output. All policy, state transitions, and per-action guidance live in the CLI output, not in the skill.

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

The goal loop handles recurrence. The skill invokes `<runner> pr-shepherd poll <N>` and prints the output. For non-terminal actions, follow the CLI's `## Instructions`, then invoke `<runner> pr-shepherd poll <N>` again. `[CANCEL]` and `[ESCALATE]` stop the goal.

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

Codex runs the same skill: invoke `<runner> pr-shepherd poll <N>`, follow the output, and continue until `[CANCEL]` or `[ESCALATE]`.

## Resolve without iterating

To fix review comments without starting a full iterate loop, run `pr-shepherd resolve` directly:

```bash
<runner> pr-shepherd resolve <N> --fetch
```

Follow the `## Instructions` in the output. The `fix_code` action emits the exact `resolve` command to run after pushing fixes — so a full `pr-shepherd` iterate tick also covers resolve.

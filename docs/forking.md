# Forking pr-shepherd

[← README](../README.md)

pr-shepherd is designed to be forked and adapted for your team or toolchain. Here's what to change.

## 1. Rename the package and plugin

In `package.json`:
```json
{
  "name": "my-shepherd",
  "bin": { "my-shepherd": "./src/index.mts" }
}
```

In `.claude-plugin/plugin.json`:
```json
{
  "name": "my-shepherd"
}
```

In `marketplace.json`:
```json
{
  "name": "my-shepherd",
  "source": { "source": "npm", "package": "my-shepherd" }
}
```

## 2. Rename the loop tag

The monitor skill tags each cron job with `# pr-shepherd-loop:pr=<N>` so `CronList` can detect existing loops. Change this string in `skills/monitor/SKILL.md` to avoid conflicts with other installations:

```
# my-shepherd-loop:pr=<PR_NUMBER>
```

## 3. Configure post-fix commands

In `.pr-shepherdrc.yml` (in your project, not the fork):
```yaml
postFixCommands:
  - npx prettier --write .
  - npx eslint --fix src/
```

Or bake them into `src/config.json` as a different default.

## 4. Adjust CI check filtering

By default only `pull_request` and `pull_request_target` events count toward CI readiness. Change `checks.relevantEvents` in `src/config.json` or `.pr-shepherdrc.yml` if your workflow uses different events.

## 5. Rename env vars and cache directories

If you need multiple versions of shepherd running simultaneously, change:
- `PR_SHEPHERD_CACHE_DIR` env var in `src/cache/file-cache.mts` and `src/commands/ready-delay.mts`
- The `pr-shepherd-cache` base directory name in the same files

## 6. Extend the action dispatch

See [extending.md](extending.md) for recipes to add new actions, check categories, or mutations.

## 7. Publish and distribute

```sh
npm publish --access public
```

Then host a `marketplace.json` at the root of your fork's repo so users can install via:
```sh
claude /plugin marketplace add yourname/my-shepherd
claude /plugin install my-shepherd
```

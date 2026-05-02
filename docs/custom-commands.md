# Custom slash commands without the plugin

[← README](../README.md)

If you don't want the full plugin, create a project-local (or user-scope)
slash command that wraps the CLI directly. This still requires `pr-shepherd`
to be installed in the repository first (preferably as a dev dependency:
`npm install --save-dev pr-shepherd`), so that `npx pr-shepherd ...` runs
without prompting to install the package.

1. **Create the command file:**
   - Project-scope: `.claude/commands/pr-check.md`
   - User-scope: `~/.claude/commands/pr-check.md`

2. **Paste this as the file contents:**

   ````markdown
   ---
   description: "Check GitHub CI status and review comments for the current PR"
   argument-hint: "[PR number or URL ...]"
   allowed-tools: ["Bash", "Read", "Grep"]
   ---

   # PR Status Check

   ## Arguments: $ARGUMENTS

   ## Resolve PR number(s)

   1. If `$ARGUMENTS` contains PR numbers or GitHub PR URLs, extract the number(s).
   2. Otherwise, infer: `gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --json number --jq '.[0].number'`
   3. If no PR found, report an error and stop.

   ## Run the check

   ```bash
   npx pr-shepherd check <PR_NUMBER> --format=json
   ```

   Parse the JSON and report:

   - **Merge status** (`mergeStatus.status`): CLEAN | BEHIND | CONFLICTS | BLOCKED | UNSTABLE | DRAFT | UNKNOWN
   - **CI check results** (`checks.passing`, `checks.failing`, `checks.inProgress`): passing count, failing names, in-progress names
   - **Unresolved review comments** (`threads.actionable` + `comments.actionable`): count + details
   ````

3. **Use it in Claude Code:**

   ```
   /pr-check
   /pr-check 42
   ```

For `monitor` and `resolve` custom commands, do **not** copy the
[`plugin/skills/`](../plugin/skills/) files directly — those contain skill/plugin-specific
frontmatter that is not valid for `.claude/commands/` files. Instead, create
`.claude/commands/pr-monitor.md` and/or `.claude/commands/pr-resolve.md`
using the same command-file structure as the `pr-check` example above, with
the CLI invocation changed to `npx pr-shepherd ...` or
`npx pr-shepherd resolve ...`. To drive the CLI without Claude at all, see
[cli-usage.md](cli-usage.md).

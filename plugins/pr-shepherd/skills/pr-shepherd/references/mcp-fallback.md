# MCP fallback

Apply only when the CLI is unavailable, MCP `iterate` exists, and the supplied target is already a GitHub URL or `owner/repo#N`.

- Pass the qualified reference directly as `pr` or `stack`. Call `iterate` with `pr`, `prs`, or `stack`, and `merge: true` when requested. Print the full result.
- If the target is bare or omitted, report that the CLI is required to resolve it in the local checkout. Do not call `gh pr view` as a separate discovery request, and do not spend a stateful tick looking for a qualified selector.
- Follow every `## Instructions` step. Use MCP `apply` and `build_suggestion_patches` with the same qualified reference instead of a shell `pr-shepherd apply`.
- Recur by repeating the same `iterate` call with the same qualified selector and `merge` option. Do not switch back to the CLI that was unavailable.
- Print a playbook with the MCP `playbook` tool.

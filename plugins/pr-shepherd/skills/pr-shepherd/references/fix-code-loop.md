# Fix-code loop

Apply when a step says `Playbook: "Fix-code loop"`. It replaces the commit and push procedure that `--instructions=inline` prints on every `[FIX_CODE]` tick. Run the numbered steps in `## Instructions` in order; this is the one that names it.

- Review and fix first. Decide per item whether it needs a code change; the reply and resolve mutations are generated either way.
- Commit and push. If you changed any files (code, docs, or config), commit them and push to the PR head branch. If you did not, do not commit. The repository's pre-push hooks and `AGENTS.md` own lint, typecheck, and format, and its conventions own rebase style and push flags.
- The `apply review` step stays inline because it needs `$DISMISS_MESSAGE` substitution. Push first: its `--require-sha HEAD` must read the pushed SHA.
- `[FIX_CODE]` is non-terminal. After the last step, iterate again immediately with the same options. Only `[ESCALATE]` hands work to a human, and `[CANCEL]` ends polling.
- Playbooks named by other steps (`Playbook: "<name>"`) ship with the package. Without the skill, print one with `pr-shepherd playbook "<name>"`, or the MCP `playbook` tool.

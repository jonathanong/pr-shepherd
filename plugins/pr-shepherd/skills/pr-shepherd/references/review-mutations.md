# Review-mutation mechanics

Apply when a step says `Playbook: "Review-mutation mechanics"`.

- Run the generated `apply review:` or `resolve-only:` command even when no code change is warranted. An `[ESCALATE]` step may require user direction first.
- The command records the disposition of the included items. Skipping it leaves authorized threads active and can trigger `fix-thrash`.
- Keep every `--dismiss-review-ids` value the CLI included. Each one is a bot or non-human review. Omitting one leaves the PR in `CHANGES_REQUESTED`.
- `$HEAD_SHA` and `$DISMISS_MESSAGE` substitution is printed in `## Instructions`. Do not drop that step.
- Generated commands include only IDs that viewer capability and Shepherd routing authorize. Omission is not a ban. A user-directed `apply review` may pass any reply, resolve, minimize, or dismiss id. GitHub's response is authoritative.

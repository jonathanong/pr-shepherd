# Noise settings

Inspect the unwanted Shepherd output, any active `.pr-shepherdrc.yml` files, and the built-in defaults before editing. Shepherd deep-merges files from the user's home directory through the working directory: closer scalar values win, nested maps merge, and closer arrays replace farther arrays. Put shared policy in the project file and personal preferences in the home file. Preserve unrelated values and existing list entries when changing an array.

Choose the narrowest control for the observed source:

| Source                                    | Setting                                              | Effect                                                                                                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repeated unchanged `WAIT` status          | `poll.quietStatus: true` or one-run `--quiet-status` | Hides unchanged polling snapshots; it does not affect single-tick `iterate` or MCP calls.                                                                                                       |
| Repetitive CI log lines                   | `checks.ignoreLogLines`                              | Drops matching raw log lines from failure excerpts and annotation deduplication input. Patterns are regex source strings.                                                                       |
| An irrelevant check context               | `ignoreChecks`                                       | Removes matching check names from output **and** readiness, triage, and stall detection. Patterns are case-insensitive globs; `actions.neverCancelRuns` can keep matching Actions runs visible. |
| Non-human PR comments or review summaries | `iterate.minimizeComments: all`, `bots`, or `none`   | Controls eligible minimization; `all` is already the default. Excluded items still appear on first look and after edits.                                                                        |
| Non-human approval reviews                | `iterate.minimizeApprovals: true`                    | Also makes eligible approvals minimizable; the default is `false`.                                                                                                                              |

For example, a project that wants quieter polling and to remove a known teardown line from CI excerpts can use:

```yaml
poll:
  quietStatus: true
checks:
  ignoreLogLines:
    - "^\\[vitest-teardown\\]"
```

Do not use `ignoreChecks` merely to hide a failing or required check: the check no longer contributes to Shepherd's readiness decision. `botUsernames` extends bot detection and handling, but configured-bot threads remain visible every tick until resolved, so it is not a general suppression setting. For a specific bot message, use the classifier guide instead. `actions.autoMinimizeSuppressed` only changes the treatment of classifier matches that set both `suppress` and `autoResolve` and is already `true` by default.

After editing, validate the YAML and regex syntax, check that the intended config file wins in the cascade, and compare representative output with the expected effect. If a live PR is used to verify behavior, account for any review mutation the configured action may authorize.

# Waiting

Apply when picking how to wait for Shepherd. Choose by what your host does when a command exits.

1. A background command's exit wakes you: run `pr-shepherd [PR ...] --until-terminal` (plus `--merge` when requested) as a background command, end the turn, and act on its output when it exits. Do not read or poll its output before then. A non-zero exit is a Shepherd action (see exit codes), not a crash; read the output.
2. No wake-up on exit (a foreground subagent, for example): run the bounded `pr-shepherd [PR ...]` in the foreground. If your command-time limit is under the default 270s, pass a smaller `--timeout`, and set the tool's own timeout above the poll when it allows. On a non-terminal `WAIT` or `READY`, rerun the same command. Never background it and check its output on a loop.
3. Single ticks (cloud sessions, MCP, `iterate`): follow the "Event loop" playbook.
4. One watcher per selection: before starting Shepherd with different PRs or flags (such as adding `--merge`), stop the running one. Never run two on the same PR.

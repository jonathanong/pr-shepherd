# Stack sessions

Apply when the target is a `--stack` selector or a stack overview.

- Shepherd, mark ready, and push only rows marked `owned`. Leave every other author's layer untouched.
- If every session belongs to someone else, report the overview and stop.
- If an owned layer needs a session, shepherd it, then rerun the same `--stack` command.
- If no `owned` row needs a session, stop.
- A stack overview heading includes `[CANCEL]` or `[ESCALATE]` when `nextAction` is `cancel` or `escalate`. Stack-level `[SHEPHERD]` is non-terminal.
- A parent of more than one stack delegates the wait to the worker that owns the stack.

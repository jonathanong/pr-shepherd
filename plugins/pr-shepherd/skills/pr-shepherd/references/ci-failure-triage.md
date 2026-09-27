# CI failure triage

Apply when a step says `Playbook: "CI failure triage"`. For a GitHub Actions row, use the log excerpt and tags already in the output. An `external` check with a URL may be opened or reproduced.

- Match each failure's `[conclusion: …]` tag. A specific conclusion wins over the general GitHub Actions row.
- `[rerun authorized]` plus a `rerun:` command means the viewer can rerun Actions (WRITE+) and this is the original attempt. Shepherd checked `repositoryPermission` and `run_attempt`.
- Run that printed command at most once. An `[attempt: N]` check never gets another rerun. A log excerpt on a later attempt is still investigation work. A later attempt with no usable evidence escalates when nothing else remains.
- A run in progress, `[conclusion: ACTION_REQUIRED]`, a check whose run id is not a GitHub Actions workflow, or a run with no attempt metadata never gets `[rerun authorized]`.
- Do not invent a handoff from `[FIX_CODE]`. Shepherd returns `[ESCALATE]` when no autonomous follow-up remains.
- Several bullets can share one run id (matrix jobs). The `rerun:` command is printed once, on the first bullet. Run it once.

## Conclusions

- GitHub Actions failure (has a run id, not `CANCELLED` or `STARTUP_FAILURE`): read the log excerpt. Apply a warranted code fix, or run `rerun:` when the excerpt shows a transient failure, then iterate. Do not wait for the rerun.
- Transient infrastructure failure: run `rerun:` when it is printed, then iterate. Do not wait. If no command is printed, finish the other surfaced work and iterate.
- Real test or build failure: fix the code. Do not rerun, even when `[rerun authorized]` is shown.
- `[conclusion: CANCELLED]` or `[conclusion: STARTUP_FAILURE]`: no log excerpt. Run `rerun:` when printed, then iterate. Do not wait. Without a command, finish other work and iterate.
- `[conclusion: ACTION_REQUIRED]`: this appears beside other autonomous work. Finish that work and iterate. Shepherd escalates if manual workflow approval is still required.
- `external` (no run id, has a URL): inspect the provider or reproduce the failure locally, apply a warranted fix, and iterate. The URL is not `[ESCALATE]` by itself.
- `(no runId)` and no URL: keep the displayed metadata. Shepherd escalates when no other autonomous work remains.

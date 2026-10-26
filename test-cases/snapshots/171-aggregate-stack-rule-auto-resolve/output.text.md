# owner/repo stack #60 — actionable

anchor PR #51 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #50: Lower layer with a bot notice — shepherded · mergeable · owned
  - OPEN · base `main`
  - classification auto-resolve: minimized 1 comment (rule: coderabbit-progress)
    - pr-comment `IC_progress` https://github.com/owner/repo/pull/50#issuecomment-9
- PR #51: Upper layer needs work — not mergeable (`review-work`) · owned
  - OPEN · base `lower` · 1 actionable

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/owner/repo/pull/51 --until-terminal`.
3. After the selected one-PR sessions, rerun this same `stack` command.

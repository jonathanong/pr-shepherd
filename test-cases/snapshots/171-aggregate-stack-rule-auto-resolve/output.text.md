# owner/repo stack #60 — actionable

anchor PR #51 · 2 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #50: Lower layer with a bot notice — shepherded · mergeable
  - OPEN · base `main`
  - classification auto-resolve: minimized 1 comment (rule: coderabbit-progress)
    - pr-comment `IC_progress` https://github.com/owner/repo/pull/50#issuecomment-9
- PR #51: Upper layer needs work — not mergeable (`review-work`)
  - OPEN · base `lower` · 1 actionable

## Instructions

1. Start one concurrent one-PR session per command below; none for layers without one.
2. Run `pr-shepherd https://github.com/owner/repo/pull/51 --until-terminal`.
3. After the selected one-PR sessions, rerun `pr-shepherd stack "owner/repo#60" --until-terminal`. Keep watching until every layer is terminal.

# jonathanong/auto-harness stack #514 — actionable

anchor PR #518 · 5 layers · mode `summary`
nextAction: shepherd

## Layers

- PR #507: docs: clarify service account credential rotation — shepherded
  - MERGED · base `main`
- PR #508: feat(host): mint per-session GitHub App tokens
  - MERGED · base `main`
- PR #510: [codex] add verified custom webhook ingress — shepherded · mergeable
  - OPEN · base `main`
- PR #511: [codex] add GitHub trigger and pull-ref foundation — shepherded · mergeable
  - OPEN · base `codex/webhook-platform`
- PR #518: [codex] add GitHub App comment ingress — not mergeable (`stale-ancestry`) · owned
  - OPEN · base `codex/github-ingress-foundation`

## Stack ancestry

- PR #518 base `codex/github-ingress-foundation` at `31259f721bca9ed99b534b8cfb82367bcaf737bc` differs from parent PR #511 head `codex/github-ingress-foundation` at `b94436d2ddf60c55948b953610b16b34cff7b4da`.

## Instructions

1. Start or delegate concurrent one-PR sessions only for `owned` rows. Leave other layers untouched.
2. Run `pr-shepherd https://github.com/jonathanong/auto-harness/pull/518 --until-terminal`.
3. After the selected one-PR sessions, rerun `pr-shepherd stack https://github.com/jonathanong/auto-harness/pull/518 --until-terminal --ready-delay 0s --stall-timeout 3600s`. Do not end the turn while any layer is non-terminal: a one-PR session returning `CANCEL` or `ESCALATE` finishes only that layer, and merged, `CANCEL`, `ESCALATE`, or handed-off layers do not count.

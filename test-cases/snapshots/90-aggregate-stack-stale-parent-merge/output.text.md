# jonathanong/auto-harness stack #514 — actionable

anchor PR #518 · 5 layers · mode `summary`
nextAction: merge

## Layers

- PR #507: docs: clarify service account credential rotation — shepherded
  - MERGED · base `main`
- PR #508: feat(host): mint per-session GitHub App tokens
  - MERGED · base `main`
- PR #510: [codex] add verified custom webhook ingress — shepherded · mergeable
  - OPEN · base `main`
- PR #511: [codex] add GitHub trigger and pull-ref foundation — shepherded · mergeable
  - OPEN · base `codex/webhook-platform`
- PR #518: [codex] add GitHub App comment ingress — not mergeable (`stale-ancestry`)
  - OPEN · base `codex/github-ingress-foundation`

## Stack ancestry

- PR #518 base `codex/github-ingress-foundation` at `31259f721bca9ed99b534b8cfb82367bcaf737bc` differs from parent PR #511 head `codex/github-ingress-foundation` at `b94436d2ddf60c55948b953610b16b34cff7b4da`.

## Instructions

1. Run `GH_REPO=jonathanong/auto-harness gh stack merge 511 --yes --squash` in `jonathanong/auto-harness` to merge PRs #510, #511 of stack #514. #518 stays open above it; GitHub retargets it onto `main`. One command lands every listed layer. Do not merge the layers one at a time with `gh pr merge`, and do not rebase or push between layers; GitHub retargets the remaining layers itself. If `gh stack` is an unknown command, run `gh extension install github/gh-stack`, then rerun that merge command.
2. Start or delegate concurrent one-PR sessions for these layers; every layer is yours.
3. Run `pr-shepherd https://github.com/jonathanong/auto-harness/pull/518 --until-terminal --merge`.
4. After the merge attempt, rerun `pr-shepherd stack "jonathanong/auto-harness#514" --until-terminal --merge-ready`; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.

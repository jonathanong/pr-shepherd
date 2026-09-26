# jonathanong/auto-harness stack #514 — actionable

Stack: #514 · anchor PR #518 · 5 layers · mode `summary`
stackMergeable: false
nextAction: merge

## Layers

- [PR #507: docs: clarify service account credential rotation](https://github.com/jonathanong/auto-harness/pull/507) — shepherded · not mergeable (`closed`)
  - MERGED · position 1/5 · base `main`
- [PR #508: feat(host): mint per-session GitHub App tokens](https://github.com/jonathanong/auto-harness/pull/508) — not shepherded · not mergeable (`closed`)
  - MERGED · position 2/5 · base `main`
- [PR #510: [codex] add verified custom webhook ingress](https://github.com/jonathanong/auto-harness/pull/510) — shepherded · mergeable
  - OPEN · position 3/5 · base `main`
- [PR #511: [codex] add GitHub trigger and pull-ref foundation](https://github.com/jonathanong/auto-harness/pull/511) — shepherded · mergeable
  - OPEN · position 4/5 · base `codex/webhook-platform`
- [PR #518: [codex] add GitHub App comment ingress](https://github.com/jonathanong/auto-harness/pull/518) — not shepherded · not mergeable (`stale-ancestry`)
  - OPEN · position 5/5 · base `codex/github-ingress-foundation`

## Stack ancestry

- PR #518 base `codex/github-ingress-foundation` at `31259f721bca9ed99b534b8cfb82367bcaf737bc` differs from parent PR #511 head `codex/github-ingress-foundation` at `b94436d2ddf60c55948b953610b16b34cff7b4da`.

## Instructions

1. PR #511 is the highest open layer of stack #514 in `jonathanong/auto-harness` whose open lower layers are all ready. Run `GH_REPO=jonathanong/auto-harness gh stack merge 511 --yes --squash` to merge PR #511 and every unmerged layer below it. When the base uses a merge queue, the same command queues that prefix together and GitHub evaluates each layer from the bottom; a failure ejects that layer and the layers above it. If `gh stack` is an unknown command, run `gh extension install github/gh-stack` first.
2. Start or delegate the relevant one-PR sessions below; review and CI work on separate layers can proceed concurrently.
3. Run `pr-shepherd https://github.com/jonathanong/auto-harness/pull/518 --until-terminal --merge` for PR #518.
4. After the merge attempt, rerun this same `--stack --merge` selector; GitHub retargets the next layer onto `main`. Shepherd any layer that GitHub rejects or ejects.

# Poll summary [ACTIONABLE]

**repo** `jonathanong/auto-harness` · **selection** stack #514 anchored at PR #518 (5 PRs) · **mode** `summary` · **next action** `fix_code`

## Pull requests

- [PR #507: docs: clarify service account credential rotation](https://github.com/jonathanong/auto-harness/pull/507) [CANCEL]
  - state `MERGED` · mergeable `UNKNOWN` · merge `UNKNOWN` · stack `514` position `1/5` base `main`
  - head `codex/github-app-docs` at `e90a5b99c42e8d7d26dc1ac28f954411f7ef79cb` · base `main`
  - reasons: `merged`
- [PR #508: feat(host): mint per-session GitHub App tokens](https://github.com/jonathanong/auto-harness/pull/508) [CANCEL]
  - state `MERGED` · mergeable `UNKNOWN` · merge `UNKNOWN` · stack `514` position `2/5` base `main`
  - head `codex/github-app-credentials` at `80ad5e9953451916b07440b4fc3675464c17ea06` · base `main`
  - reasons: `merged`
- [PR #510: \[codex\] add verified custom webhook ingress](https://github.com/jonathanong/auto-harness/pull/510) [CANCEL]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · stack `514` position `3/5` base `main`
  - head `codex/webhook-platform` at `ccbb8fdfc8317f11b0b35c5e3bc1aad6a4d83e4d` · base `main`
  - reasons: `ready-delay-elapsed`
- [PR #511: \[codex\] add GitHub trigger and pull-ref foundation](https://github.com/jonathanong/auto-harness/pull/511) [CANCEL]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · stack `514` position `4/5` base `main`
  - head `codex/github-ingress-foundation` at `b94436d2ddf60c55948b953610b16b34cff7b4da` · base `codex/webhook-platform`
  - reasons: `ready-delay-elapsed`
- [PR #518: \[codex\] add GitHub App comment ingress](https://github.com/jonathanong/auto-harness/pull/518) [WAIT]
  - state `OPEN` · mergeable `MERGEABLE` · merge `CLEAN` · ready delay `300s` · stack `514` position `5/5` base `main`
  - head `codex/github-ingress` at `17378b0a7d22a11dcf96ace7a3e56b8da64ea74f` · base `codex/github-ingress-foundation`
  - reasons: `ready-delay`
  - pollCommand: `pr-shepherd https://github.com/jonathanong/auto-harness/pull/518 --until-terminal`

## Stack ancestry

- PR #518 base `codex/github-ingress-foundation` at `31259f721bca9ed99b534b8cfb82367bcaf737bc` differs from parent PR #511 head `codex/github-ingress-foundation` at `b94436d2ddf60c55948b953610b16b34cff7b4da`.

## Instructions

1. PR #518 still records base `codex/github-ingress-foundation` at `31259f721bca9ed99b534b8cfb82367bcaf737bc`, while parent PR #511 now ends at `codex/github-ingress-foundation` `b94436d2ddf60c55948b953610b16b34cff7b4da`. From a clean checkout of `jonathanong/auto-harness`, check out the parent stack branch `codex/github-ingress-foundation`.
2. Rebase the upstack branches onto that parent with `gh stack rebase --upstack --no-trunk`, resolve any conflicts, and push the rewritten branches with `gh stack push`.
3. Rerun the same aggregate `--stack` selector and follow the next returned action.

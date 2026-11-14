# PR #42 [TRIAGE]

**status** `READY`
**summary** 1 passing
Stack: 7 (layer 2/3, base stack/7/1)

## Instructions

1. PR #42 is layer 2 of 3 in native stack #7; do not run `gh pr merge` for this layer.
2. Run `pr-shepherd stack https://github.com/owner/repo/pull/42 --until-terminal --merge-through https://github.com/owner/repo/pull/42` to merge this layer and the unmerged layers below it, never a layer above it. If lower layers are not yours it escalates `unowned-stack-layers` and merges nothing: report that to the user. Otherwise it emits one merge command that lands every layer it lists. Run that command as printed: do not merge the layers one at a time with `gh pr merge`, and do not rebase or push between layers.

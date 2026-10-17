# Estimated token counts

[← docs index](README.md) | [skills.md](skills.md) | [actions.md](actions.md)

What an agent pays to load the `pr-shepherd` skill and to read one iterate result. Whole-session cost against `gh` and the GitHub MCP server is a separate benchmark: [evals/tokens/README.md](../evals/tokens/README.md).

Method:

- Tokenizer: `o200k_base` (gpt-tokenizer). Claude and Codex counts differ.
- Counts are estimates of the checked-in text, not a live meter.
- The corpus is the 135 `test-cases/snapshots/*/output.text.md` files. Median is the middle value (the mean of the two central values when the count is even), rounded.
- Full output includes review bodies and log excerpts, which vary by PR. `## Instructions` is the stable per-tick cost.

Refresh this file when `SKILL.md`, a skill reference, or iterate `## Instructions` text changes.

## Skill

`SKILL.md` loads with the skill. A reference loads once, when a step names it with `Playbook: "<name>"` or `SKILL.md` routes to it.

| Text                       | Tokens |
| -------------------------- | -----: |
| `SKILL.md` (always loaded) |    809 |
| Draft handoff              |    680 |
| Cloud event loop           |    609 |
| Merge queue ejection       |    576 |
| CI failure triage          |    566 |
| Fix-code loop              |    374 |
| MCP fallback               |    215 |
| Suggestion patches         |    214 |
| Create a PR                |    193 |
| Branch update              |    175 |
| Every reference as well    |  4,411 |

- A `FIX_CODE` tick that names CI triage loads about 1,375 skill tokens (809 + 566).
- A merge-queue ejection tick adds 576.
- Review mutations, the Shepherd Journal, and the stack merge command are clauses in the printed steps. They load nothing.

## One iterate result

| Measure                                       | Tokens |
| --------------------------------------------- | -----: |
| Median full text output                       |    273 |
| Mean full text output                         |    298 |
| Median `## Instructions`                      |    134 |
| Mean `## Instructions`                        |    124 |
| Sum of `## Instructions` across 135 snapshots | 16,786 |

| Snapshot                                                                                 | Full output | `## Instructions` |
| ---------------------------------------------------------------------------------------- | ----------: | ----------------: |
| Multi-category `FIX_CODE` (`54-fix-code-multi-category-threads-comments-checks-changes`) |         573 |               269 |
| Ready delay (`10-ready-delay-countdown`)                                                 |         130 |                36 |
| Stack merge (`97-aggregate-stack-full-merge`)                                            |         271 |               143 |

The stack merge example prints its `gh stack` extension check inline instead of naming a playbook.

## Before on-demand playbooks

Measured against the parent of `ad9bf2cd`, when every playbook lived in `SKILL.md` and iterate repeated that prose. That corpus had 126 snapshots against 135 now, so compare medians and means, not sums. The Before figures are carried over as originally recorded, and that record does not give the mean's denominator: 18,481 ÷ 159 implies about 116 snapshots with `## Instructions`, not all 126.

| Measure                   | Before | Current |
| ------------------------- | -----: | ------: |
| Always-loaded skill       |  2,712 |     809 |
| Skill plus every playbook |  2,712 |   4,411 |
| Median full output        |    304 |     273 |
| Median `## Instructions`  |    134 |     134 |
| Mean `## Instructions`    |    159 |     124 |
| Sum of `## Instructions`  | 18,481 |  16,786 |
| Multi-category `FIX_CODE` |    432 |     269 |
| Ready delay               |     56 |      36 |
| Stack merge               |    163 |     143 |

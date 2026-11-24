# Estimated token counts

[← docs index](README.md) | [skills.md](skills.md) | [actions.md](actions.md)

What an agent pays to load the `pr-shepherd` skill and to read one iterate result. Whole-session cost against `gh` and the GitHub MCP server is a separate benchmark: [evals/tokens/README.md](../evals/tokens/README.md).

Method:

- Tokenizer: `o200k_base` (gpt-tokenizer). Claude and Codex counts differ.
- Counts are estimates of the checked-in text, not a live meter.
- The corpus is the 210 `test-cases/snapshots/*/output.text.md` files. Median is the middle value (the mean of the two central values when the count is even), rounded. `## Instructions` figures cover the 199 snapshots that print that section.
- Full output includes review bodies and log excerpts, which vary by PR. `## Instructions` is the stable per-tick cost.

Refresh this file when `SKILL.md`, a skill reference, or iterate `## Instructions` text changes.

## Skill

Only a skill's name and description are always in context. The `SKILL.md` body loads when the skill is invoked. A reference loads once, when a step names it with `Playbook: "<name>"` or `SKILL.md` routes to it.

| Text                                   | Tokens |
| -------------------------------------- | -----: |
| `SKILL.md` description (always loaded) |    115 |
| `SKILL.md` body (loaded on invoke)     |  1,012 |
| Draft handoff                          |  1,342 |
| CI failure triage                      |    702 |
| Event loop                             |    644 |
| Merge queue ejection                   |    682 |
| Create a PR                            |    554 |
| Check follow-up                        |    335 |
| Required checks unreported             |    324 |
| CI start stall                         |    317 |
| Triage loop                            |    280 |
| Waiting                                |    276 |
| Suggestion patches                     |    210 |
| Branch update                          |    197 |
| Every reference as well                |  5,863 |

A `TRIAGE` tick that names CI triage loads about 1,714 skill tokens (1,012 + 702); a merge-queue ejection tick adds 682. Review mutations and the stack merge command are printed instructions and load no playbook.

## One iterate result

| Measure                                       | Tokens |
| --------------------------------------------- | -----: |
| Median full text output                       |    214 |
| Mean full text output                         |    298 |
| Median `## Instructions`                      |     94 |
| Mean `## Instructions`                        |    125 |
| Sum of `## Instructions` across 210 snapshots | 24,780 |

| Snapshot                                                                             | Full output | `## Instructions` |
| ------------------------------------------------------------------------------------ | ----------: | ----------------: |
| Multi-category `TRIAGE` (`54-triage-multi-category-threads-comments-checks-changes`) |         333 |               146 |
| Ready delay (`10-ready-delay-countdown`)                                             |         188 |               102 |
| Stack merge (`97-aggregate-stack-full-merge`)                                        |         306 |               225 |

The stack merge example prints its `gh stack` extension check inline instead of naming a playbook.

## Before on-demand playbooks

Measured against the parent of `ad9bf2cd`, when every playbook lived in `SKILL.md` and iterate repeated that prose. The corpus was 126 snapshots then, against 210 now, so compare medians and means, not sums. The Before figures are carried over as originally recorded; the record does not give the mean's denominator, since 18,481 ÷ 159 implies about 116 snapshots with `## Instructions`, not all 126. Snapshot text also changed since, so the rows do not isolate the playbook change.

| Measure                                   | Before | Current |
| ----------------------------------------- | -----: | ------: |
| Skill body loaded on invoke               |  2,712 |   1,012 |
| Skill body plus every playbook            |  2,712 |   6,875 |
| Median full output                        |    304 |     214 |
| Median `## Instructions`                  |    134 |      94 |
| Mean `## Instructions`                    |    159 |     125 |
| Sum of `## Instructions`                  | 18,481 |  24,780 |
| Multi-category `TRIAGE` `## Instructions` |    432 |     146 |
| Ready delay `## Instructions`             |     56 |     102 |
| Stack merge `## Instructions`             |    163 |     225 |

# Estimated token counts

[← docs index](README.md) | [skills.md](skills.md) | [actions.md](actions.md)

What an agent pays to load the `pr-shepherd` skill and to read one iterate result. Whole-session cost against `gh` and the GitHub MCP server is a separate benchmark: [evals/tokens/README.md](../evals/tokens/README.md).

Method:

- Tokenizer: `o200k_base` (gpt-tokenizer). Claude and Codex counts differ.
- Counts are estimates of the checked-in text, not a live meter.
- The corpus is the 177 `test-cases/snapshots/*/output.text.md` files. Median is the middle value (the mean of the two central values when the count is even), rounded. `## Instructions` figures cover the 166 snapshots that print that section.
- Full output includes review bodies and log excerpts, which vary by PR. `## Instructions` is the stable per-tick cost.

Refresh this file when `SKILL.md`, a skill reference, or iterate `## Instructions` text changes.

## Skill

Only a skill's name and description are always in context. The `SKILL.md` body loads when the skill is invoked. A reference loads once, when a step names it with `Playbook: "<name>"` or `SKILL.md` routes to it.

| Text                                   | Tokens |
| -------------------------------------- | -----: |
| `SKILL.md` description (always loaded) |     75 |
| `SKILL.md` body (loaded on invoke)     |    856 |
| Draft handoff                          |  1,342 |
| Event loop                             |    654 |
| CI failure triage                      |    620 |
| Merge queue ejection                   |    561 |
| Triage loop                            |    289 |
| Waiting                                |    278 |
| MCP fallback                           |    220 |
| Suggestion patches                     |    210 |
| Branch update                          |    197 |
| Create a PR                            |    193 |
| Every reference as well                |  4,564 |

- A `TRIAGE` tick that names CI triage loads about 1,476 skill tokens (856 + 620) once the skill is invoked.
- A merge-queue ejection tick adds 561.
- Review mutations and the stack merge command are printed instructions and load no separate playbook. Journal updates use the explicit `apply journal` command and remain optional.

## One iterate result

| Measure                                       | Tokens |
| --------------------------------------------- | -----: |
| Median full text output                       |    211 |
| Mean full text output                         |    311 |
| Median `## Instructions`                      |     94 |
| Mean `## Instructions`                        |    113 |
| Sum of `## Instructions` across 177 snapshots | 18,840 |

| Snapshot                                                                             | Full output | `## Instructions` |
| ------------------------------------------------------------------------------------ | ----------: | ----------------: |
| Multi-category `TRIAGE` (`54-triage-multi-category-threads-comments-checks-changes`) |         329 |               142 |
| Ready delay (`10-ready-delay-countdown`)                                             |         188 |               102 |
| Stack merge (`97-aggregate-stack-full-merge`)                                        |         243 |               162 |

The stack merge example prints its `gh stack` extension check inline instead of naming a playbook.

## Before on-demand playbooks

Measured against the parent of `ad9bf2cd`, when every playbook lived in `SKILL.md` and iterate repeated that prose. The corpus was 126 snapshots then, against 177 now, so compare medians and means, not sums. The Before figures are carried over as originally recorded; the record does not give the mean's denominator, since 18,481 ÷ 159 implies about 116 snapshots with `## Instructions`, not all 126. Snapshot text also changed since, so the rows do not isolate the playbook change.

| Measure                                   | Before | Current |
| ----------------------------------------- | -----: | ------: |
| Skill body loaded on invoke               |  2,712 |     856 |
| Skill body plus every playbook            |  2,712 |   5,420 |
| Median full output                        |    304 |     211 |
| Median `## Instructions`                  |    134 |      94 |
| Mean `## Instructions`                    |    159 |     113 |
| Sum of `## Instructions`                  | 18,481 |  18,840 |
| Multi-category `TRIAGE` `## Instructions` |    432 |     142 |
| Ready delay `## Instructions`             |     56 |     102 |
| Stack merge `## Instructions`             |    163 |     162 |

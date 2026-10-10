# Estimated token counts

[← docs index](README.md) | [skills.md](skills.md) | [actions.md](actions.md)

Estimates of what an agent pays to load the `pr-shepherd` skill and to read one iterate result. Refresh this file when `SKILL.md`, a skill reference, or iterate `## Instructions` text changes.

- Tokenizer: `o200k_base` (gpt-tokenizer). Claude and Codex counts differ.
- These are estimates of the checked-in text, not a live meter.
- Median is the average of the two central values, rounded, across 135 `test-cases/snapshots/*/output.text.md` files.
- Full output includes review bodies and log excerpts. Those vary by pull request. The instruction section is the stable per-tick cost.

## Skill, current

`SKILL.md` loads with the skill. A reference loads once, when a step says `Playbook: "<name>"` or `SKILL.md` routes to it.

| Text                       | Tokens |
| -------------------------- | -----: |
| `SKILL.md` (always loaded) |    739 |
| Merge queue ejection       |    576 |
| CI failure triage          |    551 |
| Fix-code loop              |    374 |
| MCP fallback               |    215 |
| Suggestion patches         |    214 |
| Create a PR                |    193 |
| Branch update              |    175 |
| Every reference as well    |  3,037 |

A `FIX_CODE` tick that names CI triage loads about 1,290 skill tokens (739 + 551). Review mutations, the Shepherd Journal, and the stack merge command are clauses inside the printed steps, so they load nothing. A merge-queue ejection tick adds Merge queue ejection (576).

## One iterate result, current

| Measure                                       | Tokens |
| --------------------------------------------- | -----: |
| Median full text output                       |    273 |
| Mean full text output                         |    298 |
| Median `## Instructions`                      |    134 |
| Mean `## Instructions`                        |    124 |
| Sum of `## Instructions` across 135 snapshots | 16,786 |

Examples from the snapshot corpus:

| Snapshot                                                                                 | Full output | `## Instructions` |
| ---------------------------------------------------------------------------------------- | ----------: | ----------------: |
| Multi-category `FIX_CODE` (`54-fix-code-multi-category-threads-comments-checks-changes`) |         573 |               269 |
| Ready delay (`10-ready-delay-countdown`)                                                 |         130 |                36 |
| Stack merge (`97-aggregate-stack-full-merge`)                                            |         271 |               143 |

The stack merge example grew because its `gh stack` extension check is now printed inline instead of naming a playbook.

## Before on-demand playbooks

The same measurement against the parent of `ad9bf2cd`, when every playbook lived in `SKILL.md` and iterate repeated that prose. The current corpus has 135 snapshots, against 126 before, so compare medians and means rather than sums.

|                           | Before | Current |
| ------------------------- | -----: | ------: |
| Always-loaded skill       |  2,712 |     739 |
| Skill plus every playbook |  2,712 |   3,037 |
| Median full output        |    304 |     273 |
| Median `## Instructions`  |    134 |     134 |
| Mean `## Instructions`    |    159 |     124 |
| Sum of `## Instructions`  | 18,481 |  16,786 |

| Snapshot `## Instructions` | Before | Current |
| -------------------------- | -----: | ------: |
| Multi-category `FIX_CODE`  |    432 |     269 |
| Ready delay                |     56 |      36 |
| Stack merge                |    163 |     143 |

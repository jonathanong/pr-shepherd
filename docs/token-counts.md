# Estimated token counts

[← docs index](README.md) | [skills.md](skills.md) | [actions.md](actions.md)

Estimates of what an agent pays to load the `pr-shepherd` skill and to read one iterate result. Refresh this file when `SKILL.md`, a skill reference, or iterate `## Instructions` text changes.

- Tokenizer: `o200k_base` (gpt-tokenizer). Claude and Codex counts differ.
- These are estimates of the checked-in text, not a live meter.
- Median is the average of the two central values, rounded, across 116 `test-cases/snapshots/*/output.text.md` files.
- Full output includes review bodies and log excerpts. Those vary by pull request. The instruction section is the stable per-tick cost.

## Skill, current

`SKILL.md` loads with the skill. A reference loads once, when a step says `Playbook: "<name>"`.

| Text                       | Tokens |
| -------------------------- | -----: |
| `SKILL.md` (always loaded) |  1,290 |
| CI failure triage          |    548 |
| Suggestion patches         |    214 |
| Review-mutation mechanics  |    195 |
| Branch update              |    175 |
| Stack merge                |    105 |
| Shepherd Journal           |     72 |
| Every reference as well    |  2,599 |

A `FIX_CODE` tick that names CI triage, the journal, and review mutations loads about 2,105 skill tokens (1,290 + 548 + 72 + 195). A stack merge tick adds Stack merge (105) instead of Branch update.

## One iterate result, current

| Measure                                       | Tokens |
| --------------------------------------------- | -----: |
| Median full text output                       |    270 |
| Mean full text output                         |    288 |
| Median `## Instructions`                      |    119 |
| Mean `## Instructions`                        |    114 |
| Sum of `## Instructions` across 116 snapshots | 13,281 |

Examples from the snapshot corpus:

| Snapshot                                                                                 | Full output | `## Instructions` |
| ---------------------------------------------------------------------------------------- | ----------: | ----------------: |
| Multi-category `FIX_CODE` (`54-fix-code-multi-category-threads-comments-checks-changes`) |         570 |               263 |
| Ready delay (`10-ready-delay-countdown`)                                                 |         130 |                33 |
| Stack merge (`97-aggregate-stack-full-merge`)                                            |         242 |               111 |

## Before on-demand playbooks

The same measurement against the parent of `ad9bf2cd`, when every playbook lived in `SKILL.md` and iterate repeated that prose.

|                           | Before | Current |
| ------------------------- | -----: | ------: |
| Always-loaded skill       |  2,712 |   1,290 |
| Skill plus every playbook |  2,712 |   2,599 |
| Median full output        |    304 |     270 |
| Median `## Instructions`  |    134 |     119 |
| Mean `## Instructions`    |    159 |     114 |
| Sum of `## Instructions`  | 18,481 |  13,281 |

| Snapshot `## Instructions` | Before | Current |
| -------------------------- | -----: | ------: |
| Multi-category `FIX_CODE`  |    432 |     263 |
| Ready delay                |     56 |      33 |
| Stack merge                |    163 |     111 |

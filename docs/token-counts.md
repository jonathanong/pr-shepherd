# Estimated token counts

[← docs index](README.md) | [skills.md](skills.md) | [actions.md](actions.md)

Estimates of what an agent pays to load the `pr-shepherd` skill and to read one iterate result. Refresh this file when `SKILL.md`, a skill reference, or iterate `## Instructions` text changes.

- Tokenizer: `o200k_base` (gpt-tokenizer). Claude and Codex counts differ.
- These are estimates of the checked-in text, not a live meter.
- Median is the average of the two central values, rounded, across 126 `test-cases/snapshots/*/output.text.md` files.
- Full output includes review bodies and log excerpts. Those vary by pull request. The instruction section is the stable per-tick cost.

## Skill, current

`SKILL.md` loads with the skill. A reference loads once, when a step says `Playbook: "<name>"`.

| Text                       | Tokens |
| -------------------------- | -----: |
| `SKILL.md` (always loaded) |  1,447 |
| CI failure triage          |    776 |
| Merge queue ejection       |    576 |
| Suggestion patches         |    214 |
| Review-mutation mechanics  |    195 |
| Branch update              |    175 |
| Stack merge                |    105 |
| Shepherd Journal           |     72 |
| Every reference as well    |  3,560 |

A `FIX_CODE` tick that names CI triage, the journal, and review mutations loads about 2,490 skill tokens (1,447 + 776 + 72 + 195). A merge-queue ejection tick adds Merge queue ejection (576). A stack merge tick adds Stack merge (105) instead of Branch update.

## One iterate result, current

| Measure                                       | Tokens |
| --------------------------------------------- | -----: |
| Median full text output                       |    270 |
| Mean full text output                         |    292 |
| Median `## Instructions`                      |    129 |
| Mean `## Instructions`                        |    121 |
| Sum of `## Instructions` across 126 snapshots | 15,192 |

Examples from the snapshot corpus:

| Snapshot                                                                                 | Full output | `## Instructions` |
| ---------------------------------------------------------------------------------------- | ----------: | ----------------: |
| Multi-category `FIX_CODE` (`54-fix-code-multi-category-threads-comments-checks-changes`) |         570 |               266 |
| Ready delay (`10-ready-delay-countdown`)                                                 |         130 |                36 |
| Stack merge (`97-aggregate-stack-full-merge`)                                            |         242 |               114 |

## Before on-demand playbooks

The same measurement against the parent of `ad9bf2cd`, when every playbook lived in `SKILL.md` and iterate repeated that prose.

|                           | Before | Current |
| ------------------------- | -----: | ------: |
| Always-loaded skill       |  2,712 |   1,447 |
| Skill plus every playbook |  2,712 |   3,560 |
| Median full output        |    304 |     270 |
| Median `## Instructions`  |    134 |     129 |
| Mean `## Instructions`    |    159 |     121 |
| Sum of `## Instructions`  | 18,481 |  15,192 |

| Snapshot `## Instructions` | Before | Current |
| -------------------------- | -----: | ------: |
| Multi-category `FIX_CODE`  |    432 |     266 |
| Ready delay                |     56 |      36 |
| Stack merge                |    163 |     114 |

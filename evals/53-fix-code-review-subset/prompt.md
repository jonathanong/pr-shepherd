---
model: claude-sonnet-5-5
runs: 6
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
tags: [fix-code, review-budget, tier:discriminating, area:github]
append_system_prompt: |
  You have no shell and no network access. Do not run shell commands, fetch
  anything over the network, or read repository files other than a reference
  file linked from a skill you loaded. Do not ask for the repository to be provided.

  You MAY use any skill available to you. If a skill is relevant to this request,
  load it before you plan. If that skill points at a reference file, read it
  before you plan.

  State the plan you would execute, as concrete numbered steps that someone could
  follow without you. Where a step runs a command, give the exact command. Where
  you decide NOT to take an action that the output appears to offer, say so
  explicitly and say why.
---
Shepherd https://github.com/owner/repo/pull/42 through to a terminal state. I already ran the first tick —
here is what it returned. Take it from there.

---

# PR #42 [FIX_CODE]

**status** `UNRESOLVED_COMMENTS`
**summary** 1 passing

**showing** 40 of 115 review items

## Review threads

### [threadId=PRRT_active038](https://github.com/owner/repo/pull/42#discussion_r1038) — `src/module3.ts:48` (@reviewer)

> Thread 038: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active037](https://github.com/owner/repo/pull/42#discussion_r1037) — `src/module2.ts:47` (@reviewer)

> Thread 037: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active036](https://github.com/owner/repo/pull/42#discussion_r1036) — `src/module1.ts:46` (@reviewer)

> Thread 036: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active035](https://github.com/owner/repo/pull/42#discussion_r1035) — `src/module0.ts:45` (@reviewer)

> Thread 035: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active034](https://github.com/owner/repo/pull/42#discussion_r1034) — `src/module6.ts:44` (@reviewer)

> Thread 034: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active033](https://github.com/owner/repo/pull/42#discussion_r1033) — `src/module5.ts:43` (@reviewer)

> Thread 033: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active032](https://github.com/owner/repo/pull/42#discussion_r1032) — `src/module4.ts:42` (@reviewer)

> Thread 032: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active031](https://github.com/owner/repo/pull/42#discussion_r1031) — `src/module3.ts:41` (@reviewer)

> Thread 031: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active030](https://github.com/owner/repo/pull/42#discussion_r1030) — `src/module2.ts:40` (@reviewer)

> Thread 030: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active029](https://github.com/owner/repo/pull/42#discussion_r1029) — `src/module1.ts:39` (@reviewer)

> Thread 029: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active028](https://github.com/owner/repo/pull/42#discussion_r1028) — `src/module0.ts:38` (@reviewer)

> Thread 028: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active027](https://github.com/owner/repo/pull/42#discussion_r1027) — `src/module6.ts:37` (@reviewer)

> Thread 027: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active026](https://github.com/owner/repo/pull/42#discussion_r1026) — `src/module5.ts:36` (@reviewer)

> Thread 026: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active025](https://github.com/owner/repo/pull/42#discussion_r1025) — `src/module4.ts:35` (@reviewer)

> Thread 025: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active024](https://github.com/owner/repo/pull/42#discussion_r1024) — `src/module3.ts:34` (@reviewer)

> Thread 024: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active023](https://github.com/owner/repo/pull/42#discussion_r1023) — `src/module2.ts:33` (@reviewer)

> Thread 023: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active022](https://github.com/owner/repo/pull/42#discussion_r1022) — `src/module1.ts:32` (@reviewer)

> Thread 022: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active021](https://github.com/owner/repo/pull/42#discussion_r1021) — `src/module0.ts:31` (@reviewer)

> Thread 021: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active020](https://github.com/owner/repo/pull/42#discussion_r1020) — `src/module6.ts:30` (@reviewer)

> Thread 020: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active019](https://github.com/owner/repo/pull/42#discussion_r1019) — `src/module5.ts:29` (@reviewer)

> Thread 019: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active018](https://github.com/owner/repo/pull/42#discussion_r1018) — `src/module4.ts:28` (@reviewer)

> Thread 018: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active017](https://github.com/owner/repo/pull/42#discussion_r1017) — `src/module3.ts:27` (@reviewer)

> Thread 017: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active016](https://github.com/owner/repo/pull/42#discussion_r1016) — `src/module2.ts:26` (@reviewer)

> Thread 016: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active015](https://github.com/owner/repo/pull/42#discussion_r1015) — `src/module1.ts:25` (@reviewer)

> Thread 015: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active014](https://github.com/owner/repo/pull/42#discussion_r1014) — `src/module0.ts:24` (@reviewer)

> Thread 014: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active013](https://github.com/owner/repo/pull/42#discussion_r1013) — `src/module6.ts:23` (@reviewer)

> Thread 013: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active012](https://github.com/owner/repo/pull/42#discussion_r1012) — `src/module5.ts:22` (@reviewer)

> Thread 012: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active011](https://github.com/owner/repo/pull/42#discussion_r1011) — `src/module4.ts:21` (@reviewer)

> Thread 011: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active010](https://github.com/owner/repo/pull/42#discussion_r1010) — `src/module3.ts:20` (@reviewer)

> Thread 010: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active009](https://github.com/owner/repo/pull/42#discussion_r1009) — `src/module2.ts:19` (@reviewer)

> Thread 009: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active008](https://github.com/owner/repo/pull/42#discussion_r1008) — `src/module1.ts:18` (@reviewer)

> Thread 008: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active007](https://github.com/owner/repo/pull/42#discussion_r1007) — `src/module0.ts:17` (@reviewer)

> Thread 007: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active006](https://github.com/owner/repo/pull/42#discussion_r1006) — `src/module6.ts:16` (@reviewer)

> Thread 006: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active005](https://github.com/owner/repo/pull/42#discussion_r1005) — `src/module5.ts:15` (@reviewer)

> Thread 005: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active004](https://github.com/owner/repo/pull/42#discussion_r1004) — `src/module4.ts:14` (@reviewer)

> Thread 004: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active003](https://github.com/owner/repo/pull/42#discussion_r1003) — `src/module3.ts:13` (@reviewer)

> Thread 003: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active002](https://github.com/owner/repo/pull/42#discussion_r1002) — `src/module2.ts:12` (@reviewer)

> Thread 002: guard the empty input before indexing, and add a test for it.

### [threadId=PRRT_active001](https://github.com/owner/repo/pull/42#discussion_r1001) — `src/module1.ts:11` (@reviewer)

> Thread 001: guard the empty input before indexing, and add a test for it.

## Changes-requested reviews

### `reviewId=PRR_cr1` (@lead1)

> Changes requested 1: the retry loop must stop after five attempts and surface the last error.

### `reviewId=PRR_cr2` (@lead2)

> Changes requested 2: the retry loop must stop after five attempts and surface the last error.

## Instructions

1. Fix each warranted item.
2. Optional: If you reject a code review suggestion, journal why: `pr-shepherd apply journal https://github.com/owner/repo/pull/42 '- <reason>'`.
3. Commit and push any changes.
4. `$DISMISS_MESSAGE`: one sentence on what changed. Run even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --reply-thread-ids PRRT_active038,PRRT_active037,PRRT_active036,PRRT_active035,PRRT_active034,PRRT_active033,PRRT_active032,PRRT_active031,PRRT_active030,PRRT_active029,PRRT_active028,PRRT_active027,PRRT_active026,PRRT_active025,PRRT_active024,PRRT_active023,PRRT_active022,PRRT_active021,PRRT_active020,PRRT_active019,PRRT_active018,PRRT_active017,PRRT_active016,PRRT_active015,PRRT_active014,PRRT_active013,PRRT_active012,PRRT_active011,PRRT_active010,PRRT_active009,PRRT_active008,PRRT_active007,PRRT_active006,PRRT_active005,PRRT_active004,PRRT_active003,PRRT_active002,PRRT_active001 --message "$DISMISS_MESSAGE" --require-sha HEAD`
5. This is a subset: 40 of 115 review items are shown, and only their IDs are in the commands above. After handling these items, rerun Shepherd for the next batch; do not fetch the held items yourself.
6. Rerun Shepherd now.

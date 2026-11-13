// Shepherd answers for stack scenarios whose `iterate` depends on the PR asked.

/** An agent mock for \`iterate\` that answers #41 with its own tick. */
export const iterateByPr = (stackTick, tick41) => `---
type: agent
---

You are the pr-shepherd MCP \`iterate\` tool. If the call's \`pr\` or \`prs\` names PR
41 (by number or URL), answer with exactly the text between the first pair of
=== lines. For any other PR, answer with exactly the text between the second
pair. Print nothing else.

===
${tick41}
===

===
${stackTick}
===`;

// #41's tick, in the shape of fixture 25 (a changes-requested review with threads).
export const LAYER_41_TICK = `# PR #41 [TRIAGE]

**status** \`UNRESOLVED_COMMENTS\`
**summary** 1 passing
Stack: 7 (layer 1/2, base main)

## Review threads

### \`threadId=PRRT_t12\` — \`scripts/check-filters.ts:12\` (@reviewer)

> Glob \`scripts/**\` misses \`tools/run.sh\`; walk every workflow \`run:\` step instead of hard-coding the directory.

### \`threadId=PRRT_t40\` — \`scripts/check-filters.ts:40\` (@reviewer)

> Exit non-zero on a missing filter; right now it only logs.

### \`threadId=PRRT_t58\` — \`scripts/check-filters.ts:58\` (@reviewer)

> Add a test for a workflow with no \`paths:\` filter.

## Changes-requested reviews

### \`reviewId=PRR_cr41\` (@reviewer)

> Requesting changes; see the inline comments.

## Instructions

1. Fix each warranted item.
2. Optional: If you reject a code review suggestion, journal why: \`pr-shepherd apply journal https://github.com/owner/repo/pull/41 '- <reason>'\`.
3. Commit and push any changes.
4. \`$DISMISS_MESSAGE\`: one sentence on what changed. Run even if no code changed: \`pr-shepherd apply review https://github.com/owner/repo/pull/41 --reply-thread-ids PRRT_t12,PRRT_t40,PRRT_t58 --message "$DISMISS_MESSAGE" --require-sha HEAD\`
5. Rerun Shepherd now.`;

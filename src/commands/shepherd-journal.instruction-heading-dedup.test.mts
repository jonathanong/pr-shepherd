// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  SHEPHERD_JOURNAL_APPEND_HINT,
  SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE,
  SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEMS,
  SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS,
  SHEPHERD_JOURNAL_SECTION,
  buildFetchInstructions,
  buildFixInstructions,
  buildShepherdJournalInstruction,
  countMentions,
} from "./shepherd-journal.test-support.mts";
import type { AgentThread, FetchResult, ResolveCommand } from "./shepherd-journal.test-support.mts";

describe("shepherd journal instruction helpers", () => {
  it("does not duplicate Shepherd Journal heading when first-look summaries are present", () => {
    const thread: AgentThread = {
      id: "thread-1",
      path: "src/foo.ts",
      line: 10,
      author: "alice",
      authorType: "Unknown" as const,
      body: "fix with summary",
      url: "https://github.com/org/repo/pull/42#thread",
    };
    const resolveCommand: ResolveCommand = {
      argv: ["pr-shepherd", "resolve", "42"],
      requiresHeadSha: true,
      requiresDismissMessage: false,
      hasMutations: true,
    };

    const instructions = buildFixInstructions(
      [thread],
      [],
      [],
      [],
      "main",
      resolveCommand,
      false,
      42,
      0,
      [],
      [],
      [
        {
          id: "PRR_1",
          author: "reviewer",
          authorType: "Unknown" as const,
          body: "New first-look summary.",
        },
      ],
      [],
      [],
      [],
      undefined,
    );

    const text = instructions.join("\n");
    expect(text).toContain(SHEPHERD_JOURNAL_SECTION);
    expect(text).toContain(SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE);
    expect(text).toContain(SHEPHERD_JOURNAL_APPEND_HINT);
    expect(text).toContain(
      SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS,
    );
    expect(countMentions(text, SHEPHERD_JOURNAL_SECTION)).toBe(1);
  });
  it("buildShepherdJournalInstruction remains de-duped when reused across multiple instruction blocks", () => {
    const first = buildShepherdJournalInstruction(
      42,
      SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEMS,
    );
    const second = buildShepherdJournalInstruction(
      42,
      SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS,
    );
    const merged = `${first}\n---\n${second}`;
    const total = countMentions(merged, SHEPHERD_JOURNAL_SECTION);
    expect(total).toBe(2);
    expect(first).not.toContain("`## Shepherd Journal` entry");
    expect(second).not.toContain("`## Shepherd Journal` entry");
  });
  it("buildFetchInstructions emits one Shepherd Journal heading when review summaries are combined with actionable threads", () => {
    const result = buildFetchInstructions(42, {
      actionableThreads: [
        {
          id: "thread-1",
          isMinimized: false,
          isOutdated: false,
          isResolved: false,
          path: "src/foo.ts",
          line: 10,
          startLine: null,
          author: "alice",
          authorType: "Unknown" as const,
          body: "please fix",
          url: "https://github.com/org/repo/pull/42#thread",
          createdAtUnix: 1_700_000_000,
        },
      ],
      resolutionOnlyThreads: [],
      firstLookThreads: [],
      actionableComments: [],
      firstLookComments: [],
      changesRequestedReviews: [],
      reviewSummaries: [
        {
          id: "PRR_1",
          author: "copilot",
          authorType: "Unknown" as const,
          body: "first look summary",
        },
      ],
      commitSuggestionsEnabled: true,
    } as unknown as Omit<FetchResult, "instructions">);

    const text = result.join("\n");
    const match = text.match(/## Shepherd Journal/g);
    expect(match).not.toBeNull();
    expect(match).toHaveLength(1);
    expect(text).toContain(SHEPHERD_JOURNAL_SECTION);
    expect(text).toContain(SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEMS);
  });
});

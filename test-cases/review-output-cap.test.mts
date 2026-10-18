/**
 * Follow-up ticks for fixture 155 (iterate.reviewOutputMaxChars). Each tick feeds the seen
 * markers the previous tick wrote back into the next tick's seen map, as a real state dir would.
 * Held items must not be marked seen, so every later tick shows the next batch until the
 * remainder fits and the rollup disappears.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  applyFixture,
  captureRun,
  loadFixture,
  registerHarnessBefore,
  type RunResult,
} from "../test-helpers/test-cases/harness.mts";
import { loadSeenMap, markSeen, type SeenMarker } from "../src/state/seen-comments.mts";

registerHarnessBefore();

const snapshotDir = join(
  fileURLToPath(new URL("./", import.meta.url)),
  "snapshots",
  "review-output-cap-follow-up",
);

interface TickJson {
  action: string;
  fix: {
    threads?: { id: string }[];
    actionableComments?: { id: string }[];
    changesRequestedReviews?: { id: string }[];
    firstLookThreads?: { id: string }[];
    firstLookComments?: { id: string }[];
    firstLookSummaries?: { id: string }[];
    reviewItems?: { shown: number; total: number };
    resolveCommand: { argv: string[] };
    instructions: string[];
  };
  editedComments?: { id: string }[];
}

function shownIds(json: TickJson): string[] {
  const { fix } = json;
  return [
    ...(fix.changesRequestedReviews ?? []),
    ...(fix.threads ?? []),
    ...(fix.actionableComments ?? []),
    ...(fix.firstLookThreads ?? []),
    ...(fix.firstLookComments ?? []),
    ...(fix.firstLookSummaries ?? []),
    ...(json.editedComments ?? []),
  ].map((item) => item.id);
}

const hash = (body: string) => createHash("sha256").update(body, "utf8").digest("hex").slice(0, 16);

/** Seen map after this tick: the previous map plus every marker the tick wrote. */
function seenMapAfterTick(previous: Map<string, SeenMarker>): Map<string, SeenMarker> {
  const next = new Map(previous);
  for (const [, id, body] of vi.mocked(markSeen).mock.calls) {
    next.set(id, { seenAt: 1_715_800_000, bodyHash: hash(body) });
  }
  return next;
}

async function tick(seenMap: Map<string, SeenMarker>): Promise<RunResult> {
  vi.mocked(markSeen).mockClear();
  vi.mocked(loadSeenMap).mockResolvedValue(seenMap);
  return captureRun(loadFixture("155-fix-code-review-output-capped"));
}

describe("iterate.reviewOutputMaxChars follow-up ticks", () => {
  it("holds unshown items unmarked and shows them on later ticks", async () => {
    const fixture = loadFixture("155-fix-code-review-output-capped");
    applyFixture(fixture);
    let seenMap = new Map<string, SeenMarker>(Object.entries(fixture.seenMap ?? {}));

    const first = await tick(seenMap);
    const firstJson = JSON.parse(first.jsonOut) as TickJson;
    expect(firstJson.fix.reviewItems).toEqual({ shown: 40, total: 115 });
    const firstShown = new Set(shownIds(firstJson));
    const marked = new Set(vi.mocked(markSeen).mock.calls.map(([, id]) => id));
    // Held items are not marked seen, and no generated command names them.
    for (const held of ["PRRT_active039", "IC_human001", "PRRT_resolved001", "PRR_summary001"]) {
      expect(firstShown.has(held)).toBe(false);
      expect(marked.has(held)).toBe(false);
      expect(firstJson.fix.resolveCommand.argv.join(" ")).not.toContain(held);
    }
    expect(marked.has("PRRT_active001")).toBe(true);
    seenMap = seenMapAfterTick(seenMap);

    const second = await tick(seenMap);
    const secondJson = JSON.parse(second.jsonOut) as TickJson;
    expect(secondJson.action).toBe("fix_code");
    expect(secondJson.fix.reviewItems).toEqual({ shown: 42, total: 75 });
    const secondShown = shownIds(secondJson);
    // Tick 1 marked its 40 items seen, so tick 2 starts with the oldest held thread.
    expect(secondShown).toContain("PRRT_active039");
    expect(secondShown.filter((id) => id.startsWith("PRRT_active0")).sort()[0]).toBe(
      "PRRT_active039",
    );
    expect(secondShown).not.toContain("PRRT_active001");
    await expect(second.textOut).toMatchFileSnapshot(join(snapshotDir, "tick2.text.md"));
    await expect(second.jsonOut).toMatchFileSnapshot(join(snapshotDir, "tick2.json"));

    // Keep ticking until the remainder fits: every item is eventually shown, then no rollup.
    const everShown = new Set([...firstShown, ...secondShown]);
    seenMap = seenMapAfterTick(seenMap);
    let last = secondJson;
    // Every later tick is snapshotted too; evals/tokens/scenarios.mjs replays them all.
    for (let n = 3; n < 13 && last.fix.reviewItems; n++) {
      const run = await tick(seenMap);
      await expect(run.textOut).toMatchFileSnapshot(join(snapshotDir, `tick${n}.text.md`));
      await expect(run.jsonOut).toMatchFileSnapshot(join(snapshotDir, `tick${n}.json`));
      last = JSON.parse(run.jsonOut) as TickJson;
      for (const id of shownIds(last)) everShown.add(id);
      seenMap = seenMapAfterTick(seenMap);
    }
    expect(last.fix.reviewItems).toBeUndefined();
    expect(last.fix.instructions.join("\n")).not.toContain("This is a subset");
    expect(everShown.size).toBe(115);
  });
});

// node --test evals/outcomes/keep-traces.test.mjs
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { keepTraces } from "./keep-traces.mjs";

const tmp = mkdtempSync(join(tmpdir(), "keep-traces-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

function fixture(name, runs) {
  const base = join(tmp, name);
  const dirs = runs.map((id) => {
    const out = join(base, "runner", id, "out");
    mkdirSync(join(out, "mocks"), { recursive: true });
    writeFileSync(join(out, "trace.jsonl"), `${id}\n`);
    writeFileSync(join(out, "mocks", "gh.json"), "{}");
    return out;
  });
  const aggregate = join(base, "aggregate-result.json");
  const cases = [
    {
      name: "01-x",
      arms: {
        with: [{ tracePath: join(dirs[0], "trace.jsonl") }],
        without: [{ tracePath: join(dirs[1], "trace.jsonl") }, { error: "no trace" }],
      },
    },
  ];
  writeFileSync(aggregate, JSON.stringify({ cases }));
  return { base, aggregate, dirs };
}

describe("keepTraces", () => {
  it("copies each trace dir, rewrites tracePath and is rerunnable", () => {
    const { base, aggregate, dirs } = fixture("a", ["e-AAAA", "e-BBBB"]);
    assert.deepEqual(keepTraces(aggregate), { copied: 2, present: 0, missing: [] });
    const kept = JSON.parse(readFileSync(aggregate, "utf8")).cases[0].arms;
    assert.equal(kept.with[0].tracePath, join(base, "traces", "e-AAAA", "out", "trace.jsonl"));
    assert.equal(readFileSync(kept.with[0].tracePath, "utf8"), "e-AAAA\n");
    assert.ok(existsSync(join(base, "traces", "e-BBBB", "out", "mocks", "gh.json")));
    // The originals can now go; a second run changes nothing.
    for (const d of dirs) rmSync(join(d, ".."), { recursive: true });
    assert.deepEqual(keepTraces(aggregate), { copied: 0, present: 0, missing: [] });
    assert.equal(JSON.parse(readFileSync(aggregate, "utf8")).cases[0].arms.with[0].tracePath, kept.with[0].tracePath);
  });

  it("skips a directory that is already copied and reports a missing source", () => {
    const { base, aggregate, dirs } = fixture("b", ["e-CCCC", "e-DDDD"]);
    mkdirSync(join(base, "traces", "e-CCCC", "out"), { recursive: true });
    rmSync(join(dirs[1], ".."), { recursive: true });
    const stats = keepTraces(aggregate);
    assert.equal(stats.copied, 0);
    assert.equal(stats.present, 1);
    assert.equal(stats.missing.length, 1);
    assert.match(stats.missing[0], /e-DDDD/);
  });
});

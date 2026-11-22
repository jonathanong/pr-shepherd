// node --test evals/outcomes/add-runs.test.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addRuns, parseArgs } from "./add-runs.mjs";

const run = (id) => ({ id });
const full = () => ({
  meta: 1,
  cases: [
    {
      name: "12-a",
      runsPerCase: 3,
      arms: {
        with: [run(1), run(2), run(3)],
        without: [run(4), run(5), run(6)],
      },
    },
    {
      name: "75-b",
      runsPerCase: 3,
      arms: { with: [run(7)], without: [run(8)] },
    },
    {
      name: "01-c",
      runsPerCase: 3,
      arms: { with: [run(9)], without: [run(10)] },
    },
  ],
});
const top = () => ({
  cases: [
    {
      name: "12-a",
      runsPerCase: 3,
      arms: { with: [run(11)], without: [run(12)] },
    },
    {
      name: "75-b",
      runsPerCase: 3,
      arms: { with: [run(13)], without: [run(14)] },
    },
  ],
});

describe("addRuns", () => {
  it("appends runs and raises runsPerCase for scenarios that are not replaced", () => {
    const { result, log } = addRuns(full(), top(), ["75"]);
    const c = result.cases[0];
    assert.deepEqual(
      c.arms.with.map((r) => r.id),
      [1, 2, 3, 11],
    );
    assert.deepEqual(
      c.arms.without.map((r) => r.id),
      [4, 5, 6, 12],
    );
    assert.equal(c.runsPerCase, 6);
    assert.match(log[0], /added runs to 12-a: with=4 without=4/);
  });

  it("replaces a scenario named in --replace by slug prefix or full name", () => {
    for (const slug of ["75", "75-b"]) {
      const { result, log } = addRuns(full(), top(), [slug]);
      assert.deepEqual(
        result.cases[1].arms.with.map((r) => r.id),
        [13],
      );
      assert.equal(result.cases[1].runsPerCase, 3);
      assert.equal(log[1], "replaced 75-b");
    }
  });

  it("leaves scenarios absent from the top-up alone and does not mutate its inputs", () => {
    const f = full();
    const { result } = addRuns(f, top(), []);
    assert.deepEqual(result.cases[2], full().cases[2]);
    assert.equal(result.meta, 1);
    assert.deepEqual(f, full());
  });

  it("handles an arm missing from the full run and no runsPerCase", () => {
    const f = { cases: [{ name: "x", arms: {} }] };
    const t = { cases: [{ name: "x", arms: { with: [run(1)] } }] };
    const { result } = addRuns(f, t);
    assert.deepEqual(result.cases[0].arms.with, [run(1)]);
    assert.equal(result.cases[0].runsPerCase, undefined);
  });

  it("throws when the top-up has a scenario the full run lacks", () => {
    assert.throws(
      () => addRuns({ cases: [] }, { cases: [{ name: "z", arms: {} }] }),
      /not in full run: z/,
    );
  });
});

describe("parseArgs", () => {
  it("reads three files and repeated --replace", () => {
    assert.deepEqual(
      parseArgs(["a", "--replace", "75", "b", "--replace", "12", "c"]),
      {
        files: ["a", "b", "c"],
        replace: ["75", "12"],
      },
    );
  });
  it("rejects a wrong file count or a dangling --replace", () => {
    assert.throws(() => parseArgs(["a", "b"]), /usage/);
    assert.throws(() => parseArgs(["a", "b", "c", "--replace"]), /usage/);
  });
});

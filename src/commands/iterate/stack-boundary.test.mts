import { describe, expect, it } from "vitest";
import type { StackLayerOwnership } from "../../types.mts";
import {
  boundedStackPush,
  boundedStackRebase,
  formatStackLayers,
  parseStackLayers,
  withStackBoundary,
} from "./stack-boundary.mts";

const layer = (pr: number, owned: boolean): StackLayerOwnership => ({
  pr,
  position: pr,
  owned,
  branch: `b${pr}`,
});

const inside = <T,>(pr: number | undefined, layers: StackLayerOwnership[], read: () => T) =>
  withStackBoundary(pr, layers, async () => read());

describe("stack layer flag", () => {
  it("round-trips and rejects malformed values", () => {
    const layers = [layer(1, true), layer(2, false)];
    expect(formatStackLayers(layers)).toBe("1:1:o:b1,2:2:u:b2");
    expect(parseStackLayers("1:1:o:b1,2:2:u:b2")).toEqual(layers);
    expect(parseStackLayers("1:1:x:b1")).toBeNull();
    expect(parseStackLayers("")).toBeNull();
  });

  it("round-trips branch names containing commas, colons, percent signs and slashes", () => {
    const branches = ["feature,one", "a:2:o:evil", "100%", "x/y,z:w"];
    const layers = branches.map((branch, i) => ({ ...layer(i + 1, i % 2 === 0), branch }));
    const text = formatStackLayers(layers);
    expect(text.split(",")).toHaveLength(branches.length);
    expect(parseStackLayers(text)).toEqual(layers);
  });

  it("rejects an entry whose branch is not valid percent-encoding", () => {
    expect(parseStackLayers("1:1:o:%E0%A4%A")).toBeNull();
  });
});

describe("withStackBoundary", () => {
  it("applies no boundary when every layer is owned or none were given", async () => {
    expect(await inside(1, [layer(1, true)], () => boundedStackRebase(9, "P"))).toBeUndefined();
    expect(await withStackBoundary(1, undefined, async () => boundedStackPush())).toBeUndefined();
  });

  it("bounds the rebase and push to the owned prefix", async () => {
    const layers = [layer(1, true), layer(2, true), layer(3, false)];
    const rebase = await inside(2, layers, () => boundedStackRebase(9, "P"));
    expect(rebase).toContain("Unowned layer #3 in native stack #9");
    expect(rebase).toContain("`gh stack rebase --downstack`");
    expect(rebase).toContain("#3 will be stale afterwards");
    expect(await inside(2, layers, () => boundedStackRebase(9, "P", true))).toContain(
      "update only PR #2 (`b2`)",
    );
    const push = await inside(2, layers, () => boundedStackPush());
    expect(push).toContain("`b1`, `b2`");
    expect(push).toContain("<push-remote>");
  });

  it("refuses when an unowned layer sits below the PR", async () => {
    const layers = [layer(1, false), layer(2, false), layer(3, true)];
    const rebase = await inside(3, layers, () => boundedStackRebase(9, "P"));
    expect(rebase).toContain("#1, #2 sits below this PR");
    expect(rebase).toContain("waits on those layers' owner");
    expect(await inside(3, layers, () => boundedStackPush())).toContain("do not push the stack");
  });

  it("refuses everything when the session's own PR is not a known owned layer", async () => {
    const layers = [layer(1, true), layer(2, false)];
    expect(await inside(undefined, layers, () => boundedStackRebase(9, "P"))).toContain(
      "cannot tell which layers are owned",
    );
    expect(await inside(undefined, layers, () => boundedStackPush())).toContain(
      "do not push the stack",
    );
  });
});

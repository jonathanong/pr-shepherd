import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStackStatePath } from "./base.mts";
import {
  clearApprovedLayers,
  readApprovedLayers,
  writeApprovedLayers,
} from "./stack-merge-approval.mts";

let counter = 0;
const key = (scope = "all") => ({
  owner: "acme",
  repo: "widgets",
  stack: 9000 + ++counter,
  scope,
});

describe("stack merge approval record", () => {
  it("has no record until one is written", async () => {
    expect(await readApprovedLayers(key())).toBeNull();
  });

  it("round-trips the approved layers under the stack's state directory", async () => {
    const k = key("through-12");
    await writeApprovedLayers(k, [11, 12]);
    expect(await readApprovedLayers(k)).toEqual([11, 12]);
    const path = resolveStackStatePath(k, "merge-approval-through-12.json");
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ layers: [11, 12] });
  });

  it("keeps a record per scope", async () => {
    const all = key("all");
    const other = { ...all, scope: "through-3" };
    await writeApprovedLayers(all, [1, 2]);
    expect(await readApprovedLayers(other)).toBeNull();
  });

  it.each([["not json"], ['{"layers":"x"}'], ['{"layers":[1,"2"]}'], ['{"layers":[1.5]}'], ["{}"]])(
    "treats %s as no record",
    async (content) => {
      const k = key();
      const path = resolveStackStatePath(k, "merge-approval-all.json");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
      expect(await readApprovedLayers(k)).toBeNull();
    },
  );

  it("forgets the record, and clearing a missing one is harmless", async () => {
    const k = key();
    await writeApprovedLayers(k, [1]);
    await clearApprovedLayers(k);
    expect(await readApprovedLayers(k)).toBeNull();
    await expect(clearApprovedLayers(k)).resolves.toBeUndefined();
  });

  it("lets a write failure surface instead of failing open", async () => {
    const k = key();
    const path = resolveStackStatePath(k, "merge-approval-all.json");
    await mkdir(path, { recursive: true });
    await expect(writeApprovedLayers(k, [1])).rejects.toThrow();
  });
});

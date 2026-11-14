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
const CMD = "pr-shepherd stack https://github.com/acme/widgets/pull/1 --until-terminal --merge";

const DAY = 24 * 60 * 60 * 1000;

describe("stack merge approval record", () => {
  it("has no record until one is written", async () => {
    expect(await readApprovedLayers(key(), CMD)).toBeNull();
  });

  it("round-trips the approved layers under the stack's state directory", async () => {
    const k = key("through-12");
    await writeApprovedLayers(k, [11, 12], CMD, 1000);
    expect(await readApprovedLayers(k, CMD, 1000)).toEqual([11, 12]);
    const path = resolveStackStatePath(k, "merge-approval-through-12.json");
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      layers: [11, 12],
      command: CMD,
      writtenAt: 1000,
    });
  });

  it("keeps a record per scope", async () => {
    const all = key("all");
    const other = { ...all, scope: "through-3" };
    await writeApprovedLayers(all, [1, 2], CMD);
    expect(await readApprovedLayers(other, CMD)).toBeNull();
  });

  it("belongs to one request: another command line finds no record", async () => {
    const k = key();
    await writeApprovedLayers(k, [1, 2], CMD);
    expect(await readApprovedLayers(k, `${CMD} --ready-delay 5s`)).toBeNull();
  });

  it("expires after the TTL and ignores a record from the future", async () => {
    const k = key();
    await writeApprovedLayers(k, [1], CMD, 1000);
    expect(await readApprovedLayers(k, CMD, 1000 + DAY)).toEqual([1]);
    expect(await readApprovedLayers(k, CMD, 1001 + DAY)).toBeNull();
    expect(await readApprovedLayers(k, CMD, 999)).toBeNull();
  });

  it.each([
    ["not json"],
    ['{"layers":"x","command":"C","writtenAt":1}'],
    ['{"layers":[1,"2"],"command":"C","writtenAt":1}'],
    ['{"layers":[1.5],"command":"C","writtenAt":1}'],
    ['{"layers":[1],"command":"C"}'],
    ['{"layers":[1]}'],
    ["{}"],
  ])("treats %s as no record", async (content) => {
    const k = key();
    const path = resolveStackStatePath(k, "merge-approval-all.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
    expect(await readApprovedLayers(k, "C", 1)).toBeNull();
  });

  it("forgets the record, and clearing a missing one is harmless", async () => {
    const k = key();
    await writeApprovedLayers(k, [1], CMD);
    await clearApprovedLayers(k);
    expect(await readApprovedLayers(k, CMD)).toBeNull();
    await expect(clearApprovedLayers(k)).resolves.toBeUndefined();
  });

  it("lets a write failure surface instead of failing open", async () => {
    const k = key();
    const path = resolveStackStatePath(k, "merge-approval-all.json");
    await mkdir(path, { recursive: true });
    await expect(writeApprovedLayers(k, [1], CMD)).rejects.toThrow();
  });
});

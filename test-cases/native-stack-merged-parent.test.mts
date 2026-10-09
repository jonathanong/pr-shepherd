import { describe, expect, it } from "vitest";
import {
  applyFixture,
  captureRun,
  loadFixture,
  registerHarnessBefore,
} from "../test-helpers/test-cases/harness.mts";

registerHarnessBefore();

describe("native stack after its two lower layers merge", () => {
  it("rebases the actual bottom open layer onto trunk despite its retained parent base", async () => {
    const fixture = loadFixture("129-fix-code-native-stack-merged-parent");
    applyFixture(fixture);
    const result = await captureRun(fixture);
    const json = JSON.parse(result.jsonOut);

    expect(result.exitCode).toBe(12);
    expect(result.jsonExitCode).toBe(result.exitCode);
    expect(json.action).toBe("fix_code");
    expect(json.stackTrunkConflict).toBe("main");
    expect(json.baseBranch).toBe("fix/2429-hostname-flags-not-null");
    for (const output of [result.textOut, json.fix.instructions.join("\n")]) {
      expect(output).toContain("`gh stack checkout 2535`");
      expect(output).toContain("head branch of PR #2547 and run `gh stack rebase`");
      expect(output).toContain("`gh stack push`");
      expect(output).not.toContain("--upstack --no-trunk");
      expect(output).not.toContain("gh pr edit");
    }
  });

  it("dispatches review work for every open layer while keeping merged layers out of sessions", async () => {
    const fixture = loadFixture("130-aggregate-stack-merged-parent-work");
    applyFixture(fixture);
    const result = await captureRun(fixture);
    const json = JSON.parse(result.jsonOut);

    expect(result.exitCode).toBe(16);
    expect(result.jsonExitCode).toBe(result.exitCode);
    expect(json.nextAction).toBe("shepherd");
    expect(json.stackMergeable).toBe(false);
    expect(json.prs.map((row: { state: string }) => row.state)).toEqual([
      "MERGED",
      "MERGED",
      "OPEN",
      "OPEN",
      "OPEN",
      "OPEN",
    ]);
    for (const output of [result.textOut, json.instructions.join("\n")]) {
      for (const pr of [2547, 2569, 2627, 2629]) {
        expect(output).toContain(
          `pr-shepherd https://github.com/vouchington/vouchington/pull/${pr} --until-terminal`,
        );
      }
      for (const pr of [2509, 2534]) {
        expect(output).not.toContain(`pull/${pr} --until-terminal`);
      }
      expect(output).not.toContain("gh stack merge");
      expect(output).not.toContain("gh stack rebase");
    }
  });

  it("holds merging until GitHub retargets the READY bottom open layer onto trunk", async () => {
    const fixture = loadFixture("131-aggregate-stack-merged-parent-retarget-wait");
    applyFixture(fixture);
    const result = await captureRun(fixture);
    const json = JSON.parse(result.jsonOut);

    expect(result.exitCode).toBe(10);
    expect(result.jsonExitCode).toBe(result.exitCode);
    expect(json.nextAction).toBe("wait");
    expect(json.stackMergeable).toBe(true);
    expect(json.prs.slice(2).every((row: { shepherded: boolean }) => row.shepherded)).toBe(true);
    for (const output of [result.textOut, json.instructions.join("\n")]) {
      expect(output).toContain(
        "PR #2547 still targets `fix/2429-hostname-flags-not-null` rather than `main`",
      );
      expect(output).not.toContain("gh stack merge");
      expect(output).not.toContain("gh pr edit");
    }
  });
});

import { describe, it, expect } from "vitest";
import { formatPlaybookResult, runPlaybook } from "./playbook.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";

describe("runPlaybook", () => {
  it("lists every shipped playbook when no name is given", () => {
    const result = runPlaybook();
    expect(result).toHaveProperty("playbooks");
    const names = (result as { playbooks: string[] }).playbooks;
    expect(names).toContain("Fix-code loop");
    expect(names).toContain("Shepherd Journal");
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(runPlaybook("  ")).toEqual(result);
  });

  it("resolves by name, case-insensitively, and by file slug", () => {
    const byName = runPlaybook("Fix-code loop");
    expect(byName).toMatchObject({ name: "Fix-code loop" });
    expect(runPlaybook("fix-code loop")).toEqual(byName);
    expect(runPlaybook("fix-code-loop")).toEqual(byName);
    expect(runPlaybook("shepherd journal")).toMatchObject({
      name: "Shepherd Journal",
    });
  });

  it("fails with usage and the available names for an unknown playbook", () => {
    try {
      runPlaybook("nope");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ShepherdError);
      expect((error as ShepherdError).exitCode).toBe(EXIT.USAGE);
      expect(String(error)).toContain('Unknown playbook "nope"');
      expect(String(error)).toContain('"Fix-code loop"');
    }
  });
});

describe("formatPlaybookResult", () => {
  it("renders names as a bullet list and a playbook as trimmed Markdown", () => {
    expect(formatPlaybookResult({ playbooks: ["A", "B"] })).toBe("- A\n- B");
    expect(formatPlaybookResult({ name: "A", content: "# A\n\nbody\n\n" })).toBe("# A\n\nbody");
  });
});

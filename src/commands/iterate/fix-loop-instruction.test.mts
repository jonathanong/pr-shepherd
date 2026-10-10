import { describe, it, expect } from "vitest";
import { buildPushJournalSteps } from "./fix-loop-instruction.mts";
import { buildFixInstructions } from "./render.mts";

const resolveCommand = {
  argv: ["pr-shepherd", "resolve", "42"],
  requiresHeadSha: true,
  requiresDismissMessage: false,
  hasMutations: true,
};

describe("buildPushJournalSteps playbook fold", () => {
  it("folds commit, journal, and the playbook pointer into one step", () => {
    const text = buildPushJournalSteps("playbook", 42, true, true).join("\n");
    expect(text).toContain("Commit and push any code changes.");
    expect(text).toContain("pr-shepherd apply journal 42 '- <decision>'");
    expect(text).toContain(`Playbook: "Fix-code loop".`);
    expect(text).toContain('CLI: `pr-shepherd playbook "Fix-code loop"`.');
  });

  it("omits the parts that do not apply", () => {
    const text = buildPushJournalSteps("playbook", 42, false, true).join("\n");
    expect(text).not.toContain("Commit and push");
    expect(text).toContain("apply journal");
    expect(text).toContain('Playbook: "Fix-code loop".');
  });

  it("emits nothing when neither step applies", () => {
    expect(buildPushJournalSteps("playbook", 42, false, false)).toEqual([]);
  });

  it("keeps the steps inline in inline style", () => {
    const steps = buildPushJournalSteps("inline", 42, true, true);
    expect(steps).toHaveLength(2);
    expect(steps.join("\n")).not.toContain("Fix-code loop");
  });
});

describe("buildFixInstructions instruction style", () => {
  const call = (style: "inline" | "playbook", viewerCanUpdate: boolean) =>
    buildFixInstructions(
      [],
      [],
      [],
      [
        {
          id: "r-1",
          author: "rev",
          authorType: "Unknown" as const,
          body: "Please fix.",
        },
      ],
      "main",
      resolveCommand,
      false,
      42,
      0,
      [],
      [],
      [],
      [],
      [],
      [],
      undefined,
      "",
      false,
      viewerCanUpdate,
      false,
      undefined,
      undefined,
      style,
    );

  it("playbook style replaces the commit and journal steps with one pointer", () => {
    const text = call("playbook", true).join("\n");
    expect(text).toContain('Playbook: "Fix-code loop"');
    expect(text).not.toContain("If you changed code, commit any remaining changes");
    expect(text).not.toContain("append `- <decision>` to Shepherd Journal");
    expect(text).toContain("replace `$HEAD_SHA`");
    expect(text).toContain("`[FIX_CODE]` is non-terminal");
  });

  it("playbook style omits the journal clause without update permission", () => {
    const text = call("playbook", false).join("\n");
    expect(text).toContain("Commit and push any code changes.");
    expect(text).not.toContain("apply journal");
  });

  it("inline style keeps the full text", () => {
    const text = call("inline", true).join("\n");
    expect(text).not.toContain("Fix-code loop");
    expect(text).toContain("If you changed code, commit any remaining changes");
    expect(text).toContain("append `- <decision>` to Shepherd Journal");
  });
});

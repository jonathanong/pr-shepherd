import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handlePlaybook } from "./playbook-handler.mts";
import { EXIT } from "../exit-codes.mts";

let out = "";
let err = "";

beforeEach(() => {
  out = "";
  err = "";
  process.exitCode = undefined;
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    err += String(chunk);
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("handlePlaybook", () => {
  it("prints help and exits cleanly", () => {
    handlePlaybook(["--help"]);
    expect(out).toContain("pr-shepherd playbook");
    expect(process.exitCode).toBeUndefined();
  });

  it("lists playbooks as text and JSON", () => {
    handlePlaybook([]);
    expect(out).toContain("- Fix-code loop");
    out = "";
    handlePlaybook(["--format=json"]);
    expect(JSON.parse(out).playbooks).toContain("Fix-code loop");
  });

  it("prints a multi-word playbook name given as separate words or quoted", () => {
    handlePlaybook(["Fix-code", "loop"]);
    expect(out).toContain("# Fix-code loop");
    out = "";
    handlePlaybook(["Fix-code loop", "--format", "json"]);
    expect(JSON.parse(out)).toMatchObject({ name: "Fix-code loop" });
  });

  it("reports an unknown playbook with a usage exit code", () => {
    handlePlaybook(["nope"]);
    expect(err).toContain("pr-shepherd: playbook:");
    expect(err).toContain("Unknown playbook");
    expect(process.exitCode).toBe(EXIT.USAGE);
  });

  it("rejects unknown flags and invalid formats", () => {
    handlePlaybook(["--bogus"]);
    expect(err).toContain("unknown flag --bogus");
    expect(process.exitCode).toBe(EXIT.USAGE);
    process.exitCode = undefined;
    err = "";
    handlePlaybook(["--format", "xml"]);
    expect(err).toContain("invalid --format xml");
    expect(process.exitCode).toBe(EXIT.USAGE);
  });

  it("maps a non-ShepherdError failure to a usage exit code", async () => {
    const mod = await import("../commands/playbook.mts");
    vi.spyOn(mod, "runPlaybook").mockImplementation(() => {
      throw new Error("boom");
    });
    handlePlaybook([]);
    expect(err).toContain("boom");
    expect(process.exitCode).toBe(EXIT.USAGE);
  });
});

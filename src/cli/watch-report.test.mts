import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT } from "../exit-codes.mts";
import {
  buildWatchedReport,
  emitWatched,
  formatWatchedReport,
  noteWatched,
} from "./watch-report.mts";

const repo = { owner: "acme", name: "widgets" };
const holders = [
  { pr: 2, pid: 1234, flags: ["--merge", "--until-terminal"] },
  { pr: 3, pid: 1234, flags: [] },
];

let out: string[];
let err: string[];

beforeEach(() => {
  out = [];
  err = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => out.push(String(chunk)) > 0);
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => err.push(String(chunk)) > 0);
});
afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("buildWatchedReport", () => {
  it("names each PR, its PID, and its flags as numbered steps", () => {
    expect(buildWatchedReport(repo, holders)).toEqual({
      mode: "watch-lock",
      repo: "acme/widgets",
      alreadyWatched: holders,
      instructions: [
        "1. PR #2 is already watched by PID 1234 (flags: --merge --until-terminal).",
        "2. PR #3 is already watched by PID 1234 (flags: none).",
        "3. Do not start another watcher for a PR listed above; the process that holds it already polls it.",
        "4. If its flags differ from what you need (for example you need `--merge` and it lacks it), stop PID 1234 and rerun this command.",
      ],
    });
  });

  it("lists each distinct holder PID in the stop step", () => {
    const report = buildWatchedReport(repo, [holders[0]!, { pr: 4, pid: 99, flags: [] }]);
    expect(report.instructions.at(-1)).toContain("stop PID 1234, 99 and rerun");
  });
});

describe("emitWatched", () => {
  it("prints Markdown with an Instructions section and exits with the WATCHED code", () => {
    emitWatched(repo, holders, "text");
    expect(out.join("")).toBe(`${formatWatchedReport(buildWatchedReport(repo, holders))}\n`);
    expect(out.join("")).toMatch(
      /^## Already watched\n\nacme\/widgets #2, #3\n\n## Instructions\n\n1\. /,
    );
    expect(process.exitCode).toBe(EXIT.WATCHED);
    expect(EXIT.WATCHED).toBe(17);
  });

  it("prints the same information as one JSON object", () => {
    emitWatched(repo, holders, "json");
    const parsed = JSON.parse(out.join(""));
    expect(parsed).toEqual(buildWatchedReport(repo, holders));
    expect(formatWatchedReport(parsed)).toContain(parsed.instructions.join("\n"));
    expect(process.exitCode).toBe(EXIT.WATCHED);
  });
});

describe("noteWatched", () => {
  it("writes the report to stderr and leaves the exit code alone", () => {
    noteWatched(repo, holders);
    expect(err.join("")).toContain("## Instructions");
    expect(out).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });
});

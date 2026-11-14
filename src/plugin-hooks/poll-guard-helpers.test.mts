import { describe, expect, it } from "vitest";

import {
  detectPoller,
  expandPath,
  guardMessage,
  readLevel,
} from "../../plugins/pr-shepherd/hooks/poll-guard-detect.mjs";

describe("shell forms that look like PR reads but are not", () => {
  it.each([
    "command -v pr-shepherd; sleep 120; command -V gh",
    "sleep 120; command -v pr-shepherd",
    "echo $'it\\'s gh pr checks 42 --watch'",
    "while :; do gh api repos/o/r/actions/runs/1 > pulls.json; sleep 60; done",
    "while :; do curl https://api.github.com/repos/o/r/actions/runs/1 -o pulls.json; sleep 60; done",
    "while :; do curl https://api.github.com/repos/o/r/actions/runs/1 -o/tmp/pulls.json; sleep 60; done",
    "while :; do curl -sSo pulls.json https://api.github.com/repos/o/r/actions/runs/1; sleep 60; done",
    "while :; do curl --output=pulls.json https://api.github.com/repos/o/r/actions/runs/1; sleep 60; done",
    `for term in alpha beta; do gh pr list --search "it's $term's PR"; sleep 1; done`,
    `for t in a b; do gh pr list --search "x \\"$t\\" y"; sleep 1; done`,
  ])("does not flag %s", (command) => {
    expect(detectPoller(command)).toBeNull();
  });

  it.each([
    "for pr in 1 2 3; do gh pr view 42 --json state --jq '. as $pr | $pr.state'; sleep 60; done",
    "echo $'a\\'b'; gh pr checks 42 --watch",
    "while :; do gh api repos/o/r/pulls/42 > out.json; sleep 60; done",
  ])("flags %s", (command) => {
    expect(detectPoller(command)).not.toBeNull();
  });
});

describe("expandPath", () => {
  const env = { HOME: "/home/u", TMPDIR: "/tmp/x" };
  it("expands home, variables and quotes", () => {
    expect(expandPath("~/a.sh", env)).toBe("/home/u/a.sh");
    expect(expandPath("$TMPDIR/a.sh", env)).toBe("/tmp/x/a.sh");
    expect(expandPath('"${TMPDIR}/a.sh"', env)).toBe("/tmp/x/a.sh");
    expect(expandPath("$NOPE/a.sh", env)).toBe("$NOPE/a.sh");
    expect(expandPath("~/a.sh", {})).toBe("~/a.sh");
  });
});

describe("readLevel", () => {
  it("defaults to advisory", () => {
    expect(readLevel({})).toEqual({ level: "advisory" });
    expect(readLevel({ PR_SHEPHERD_POLL_GUARD: "" })).toEqual({ level: "advisory" });
  });

  it.each(["disabled", "advisory", "fail"])("accepts %s", (level) => {
    expect(readLevel({ PR_SHEPHERD_POLL_GUARD: level })).toEqual({ level });
  });

  it("rejects other values with an error", () => {
    expect(readLevel({ PR_SHEPHERD_POLL_GUARD: "block" })).toEqual({
      error: expect.stringMatching(/must be one of disabled, advisory, fail; got "block"/),
    });
  });
});

describe("guardMessage", () => {
  it("names the finding and the Shepherd command", () => {
    const text = guardMessage("a loop");
    expect(text).toContain("(a loop)");
    expect(text).toContain("pr-shepherd <all PRs> --until-terminal");
  });
});

import { describe, expect, it } from "vitest";

import {
  detectPoller,
  expandPath,
  guardMessage,
  readLevel,
} from "../../plugins/pr-shepherd/hooks/poll-guard-detect.mjs";

// Commands agents actually ran instead of one `pr-shepherd … --until-terminal`.
const POLLERS = [
  "until gh pr view 5441 --repo vouchington/vouchington --json state -q .state | grep -qx MERGED; do sleep 120; done; echo merged",
  'until [ "$(gh pr view 5452 --json state -q .state)$(gh pr view 5441 --json state -q .state)" = MERGEDMERGED ]; do sleep 90; done',
  'while true; do\n  pr-shepherd 5441 > "$TMPDIR/shep5441.txt" 2>&1; rc=$?\n  [ $rc -ne 10 ] && break\n  sleep 60\ndone',
  'while true; do gh api graphql -f query=\'{ repository(owner:"o", name:"r") { pullRequest(number: 1) { mergeQueueEntry { position } } } }\'; sleep 180; done',
  "sleep 300 && gh pr view 42 --json mergeStateStatus",
  "watch -n 60 gh pr checks 42",
  "for i in $(seq 1 20); do curl -s https://api.github.com/repos/o/r/pulls/42 | jq .state; sleep 30; done",
  "gh run watch 123456 --exit-status",
  "gh pr checks 42 --watch",
  "gh pr checks 42 -w --interval 30",
];

// Ordinary one-off reads and Shepherd itself.
const ALLOWED = [
  "gh pr view 5441 --json state",
  "gh run view 42760479446 --log-failed",
  "for pr in 41 42 43; do gh pr view $pr --json title -q .title; done",
  "npx pr-shepherd 5478 5406 --until-terminal --merge",
  "pr-shepherd 671 --until-terminal",
  "sleep 5 && npm test",
  "while read -r line; do echo $line; done < notes.txt",
  "gh pr checks 42",
  "git log --until=yesterday",
  "gh pr create --title watch --body 'until done'",
  "",
];

describe("detectPoller", () => {
  it.each(POLLERS)("flags %s", (command) => {
    expect(detectPoller(command)).toEqual(expect.any(String));
  });

  it.each(ALLOWED)("allows %s", (command) => {
    expect(detectPoller(command)).toBeNull();
  });

  it("ignores non-string input", () => {
    expect(detectPoller(undefined)).toBeNull();
  });

  it("names a blocking watcher", () => {
    expect(detectPoller("gh run watch 1")).toMatch(/blocking CI watcher/);
  });

  it("checks the contents of a script the command runs", () => {
    const scripts: Record<string, string> = {
      "/tmp/wait-queue.sh":
        '#!/bin/bash\nwhile gh pr view "$1" --json mergeQueueEntry; do sleep 180; done\n',
      "./build.sh": "npm run build\n",
    };
    const read = (path: string) => scripts[path] ?? null;
    expect(detectPoller("bash /tmp/wait-queue.sh 5478", read)).toMatch(
      /the script `\/tmp\/wait-queue.sh`/,
    );
    expect(detectPoller("sh -e /tmp/wait-queue.sh 5478", read)).toMatch(/wait-queue/);
    expect(detectPoller("cd x && /tmp/wait-queue.sh 5478", read)).toMatch(/wait-queue/);
    expect(detectPoller("./build.sh", read)).toBeNull();
    expect(detectPoller("bash missing.sh", read)).toBeNull();
    expect(detectPoller("bash -c 'echo hi'", read)).toBeNull();
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

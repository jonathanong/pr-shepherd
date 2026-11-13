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
  "gh pr checks 42 --watch",
  "gh pr checks 42 -w --interval 30",
  "watch -n 60 'gh pr checks 42'",
  "watch --interval=30 gh pr view 42 --json mergeStateStatus",
  "bash -c 'while true; do gh pr view 1 --json state; sleep 60; done'",
  "while :; do npx -y pr-shepherd 42 --format=json; sleep 2m; done",
  "until gh api repos/o/r/pulls/42 --jq .merged | grep -q true; do\n  sleep 30\ndone",
  "for i in $(seq 1 10); do\n  if gh pr view 42 --json state -q .state | grep -q MERGED; then break; fi\n  sleep 30\ndone",
  "sleep 5m; gh pr checks 42",
  "sleep 600; S=/tmp/x; pr-shepherd 593 --merge > $S/out.txt",
  'for i in $(seq 1 20); do out=$(timeout 300 pr-shepherd 12 2>&1); case "$out" in *WAIT*) sleep 20;; *) break;; esac; done',
  'while [ "$(gh run view 43 --json status -q .status)" != completed ]; do sleep 60; done; pr-shepherd 618 --until-terminal --merge',
  "gh run watch 43 --exit-status && gh pr merge 5 --squash",
  'until out=$(pr-shepherd 16 2>&1); echo "$out" | grep -q READY; do sleep 30; done',
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
  // #712: a clock wait whose loop body reads no GitHub state.
  'while [ "$(date -u +%H%M)" -lt 1632 ]; do sleep 60; done\ngh workflow run evals.yml --ref some-branch -f batch=x\nsleep 20\ngh run list --workflow evals.yml --limit 1 --json databaseId,status',
  // #712: a workflow run may belong to no PR.
  "gh run watch <run-id> --interval 120\ngh run view <run-id> --json status,conclusion",
  "gh run watch 123456 --exit-status",
  "gh pr merge 27 --squash; gh workflow run publish.yml; sleep 8; gh run watch 99 --exit-status",
  "timeout -s KILL 5m npm test",
  "gh run rerun 43 --failed; sleep 90; pr-shepherd 640 --until-terminal --merge",
  "while gh run view 9 --json status -q .status | grep -qv completed; do sleep 60; done",
  // #712: `pr-shepherd` in a path, and no GitHub read in the loop.
  "find ~/.claude/plugins -path '*pr-shepherd*' -name plugin.json | while read f; do grep '\"repository\"' \"$f\"; done",
  // #712: `gh run watch` as a quoted search string.
  'gh issue list --repo owner/repo --search "gh run watch OR workflow_dispatch OR poller"',
  'while read -r pr; do gh pr view "$pr" --json title; done < prs.txt',
  "gh pr create --fill; sleep 10; gh pr view --json url",
  'echo "sleep 300 && gh pr view 1"',
  "# while true; do gh pr view 1; sleep 60; done\nnpm test",
  "cat > wait.md <<'EOF'\nwhile true; do gh pr view 1; sleep 60; done\nEOF",
  "cat <<-EOF\n\twatch gh pr checks 1\n\tEOF\necho ok",
  'gh pr comment 1 --body "run \\"gh pr checks --watch\\" later"',
  "sleep $DELAY; gh pr view 1",
  // Pacing through a list of PRs is iteration, not polling.
  "for pr in 41 42 43; do gh pr view $pr --json state; sleep 1; done",
  'while read -r owner pr; do gh pr view "${pr}" -R "$owner/r"; sleep 2; done < prs.txt',
  "sleep 300; pr-shepherd 42 --until-terminal",
  "gh pr view 1 --json state; sleep 120",
  "sleep 120; pr-shepherd apply review https://github.com/o/r/pull/1 --resolve-thread-ids X",
  "sleep 605 && pr-shepherd 1 --until-terminal; sleep 20; gh pr list --state all",
  "sleep 90; npm test; gh pr view 1",
  "while true; do pr-shepherd playbook triage-loop; sleep 60; done",
  "while true; do sleep 60; done; gh pr view 1",
  "while sleep 60; do gh api repos/o/r/actions/runs/1 --jq .status; done",
  "for i in 1 2; do sleep 60; done\ncurl -s https://example.com/pulls",
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

  it("names each finding", () => {
    expect(detectPoller("gh pr checks 1 --watch")).toMatch(/blocking CI watcher/);
    expect(detectPoller("watch gh pr view 1")).toMatch(/polling loop/);
    expect(detectPoller("sleep 1h && gh pr view 1")).toMatch(/wait of 60 seconds/);
  });

  it("keeps an unterminated quote or heredoc as data", () => {
    expect(detectPoller("echo 'while true; do gh pr view 1; sleep 60; done")).toBeNull();
    expect(detectPoller('echo "$(gh pr view 1)')).toBeNull();
    expect(detectPoller("cat <<EOF\nsleep 90; gh pr view 1")).toBeNull();
    expect(detectPoller("bash -c 'unterminated")).toBeNull();
  });

  it("sees command substitutions inside double quotes and backticks", () => {
    expect(
      detectPoller('until [ "`gh pr view 1 -q .state`" = MERGED ]; do sleep 30; done'),
    ).toMatch(/polling loop/);
    expect(detectPoller('while [ "$(echo "$(gh pr view 1)")" ]; do sleep 30; done')).toMatch(
      /polling loop/,
    );
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
    expect(detectPoller("bash -c", read)).toBeNull();
    expect(detectPoller("bash -x", read)).toBeNull();
    expect(
      detectPoller('bash "$TMPDIR/wait.sh"', (p) =>
        p.includes("wait") ? scripts["/tmp/wait-queue.sh"]! : null,
      ),
    ).toMatch(/wait/);
    expect(
      detectPoller(
        "bash /tmp/notes.sh",
        () => "grep '*pr-shepherd*' x | while read f; do echo $f; done",
      ),
    ).toBeNull();
  });
});

describe("backgrounded Shepherd", () => {
  it.each([
    "pr-shepherd 41 42 --until-terminal --merge &",
    "nohup pr-shepherd stack 41 --until-terminal > out.log 2>&1 &",
    "npx pr-shepherd 671 --until-terminal",
  ])("does not flag %s", (command) => {
    expect(detectPoller(command)).toBeNull();
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

// Detects shell commands that wait on GitHub PR state on their own instead of
// running one `pr-shepherd … --until-terminal`. Host-independent: the Claude Code
// and Codex adapters pass the command text and a script reader.
//
// Only waits on a pull request are flagged. A workflow run (`gh run …`) may belong
// to no PR, such as a `workflow_dispatch` run, so a run wait counts only when a PR
// command (`gh pr …` or `pr-shepherd`) follows it in the same command.
// Words inside quotes, comments and heredocs are data, not commands. Anything the
// scanner cannot classify passes: the guard prefers a miss to a false positive.

import { leadingQuoted, simpleCommands, usesLoopVar } from "./poll-guard-shell.mjs";

const PR_SUBCOMMANDS = new Set(["view", "checks", "status", "list"]);
const PR_API = /pulls|pullRequest/;
const SHELLS = new Set(["bash", "sh", "zsh"]);
// A sleep this long right before a single PR read is a wait, not a settle.
const MIN_WAIT_SECONDS = 60;

const WATCHER =
  "a blocking CI watcher (`gh pr checks --watch`, or `gh run watch` beside a PR command)";
const LOOP =
  "a polling loop around a PR read (`gh pr`, `gh api` or `curl` on pull requests, `pr-shepherd`, or `gh run` beside a PR command, repeated with `sleep` or `watch`)";
const WAIT = `a wait of ${MIN_WAIT_SECONDS} seconds or more before a PR read`;

export const LEVELS = ["disabled", "advisory", "fail"];

/**
 * Returns a short description of the polling found in `command`, or null.
 * `readScript(path)` returns a script's text or null; it is called only for
 * scripts the command runs, and their contents are checked one level deep.
 */
export function detectPoller(command, readScript = () => null) {
  if (typeof command !== "string" || command.length === 0) return null;
  const commands = simpleCommands(command);
  const own = detectIn(commands, true);
  if (own) return own;
  for (const path of scriptPaths(commands)) {
    const text = readScript(path);
    if (typeof text !== "string") continue;
    const found = detectIn(simpleCommands(text), true);
    if (found) return `the script \`${path}\` contains ${found}`;
  }
  return null;
}

function detectIn(commands, nested) {
  const sleeps = [];
  const reads = [];
  const runReads = [];
  let lastPr = -1;
  for (const [index, cmd] of commands.entries()) {
    const words = cmd.words.map((w) => w.word);
    const inner = nested ? quotedCommand(cmd, words) : null;
    if (inner !== null) {
      const innerCommands = simpleCommands(inner);
      const found = detectIn(innerCommands, false);
      if (found) return found;
      // The shell's own loop or `watch` repeats the inner read.
      if (innerCommands.some((c) => isPrRead(c))) {
        if (cmd.watched) return LOOP;
        reads.push({ index, cmd });
      }
    }
    if (words[0] === "sleep") sleeps.push({ index, cmd, seconds: seconds(words.slice(1)) });
    else if (isWatcher(words)) return WATCHER;
    else if (isPrRead(cmd)) {
      if (cmd.watched) return LOOP;
      reads.push({ index, cmd });
    } else if (isRunRead(words)) runReads.push({ index, cmd });
    if (words[0] === "pr-shepherd" || (words[0] === "gh" && words[1] === "pr")) lastPr = index;
  }
  // A workflow run may belong to no PR. A wait on a run followed by Shepherd or a
  // `gh pr` command is a wait on that PR's CI; one after a merge (a publish run) is not.
  const prRuns = runReads.filter((r) => r.index < lastPr);
  if (prRuns.some((r) => r.cmd.words[2].word === "watch")) return WATCHER;
  reads.push(...prRuns);
  for (const read of reads) {
    // A loop polls when it sleeps and re-reads a state that does not depend on its variable.
    const loops = new Set(
      read.cmd.loops.filter((l) => !l.vars.some((v) => usesLoopVar(read.cmd, v))).map((l) => l.id),
    );
    if (sleeps.some((s) => s.cmd.loops.some((l) => loops.has(l.id)))) return LOOP;
    // A long sleep whose very next command is the PR read, outside any loop.
    const waited = sleeps.some(
      (s) =>
        s.index === read.index - 1 && s.cmd.loops.length === 0 && s.seconds >= MIN_WAIT_SECONDS,
    );
    if (waited) return WAIT;
  }
  return null;
}

/** `-c`, or combined shell options that include it, such as `-lc` or `-ec`. */
const isCommandFlag = (word) => /^-[a-z]*c[a-z]*$/i.test(word);

const isRunRead = (words) =>
  words[0] === "gh" && words[1] === "run" && ["view", "list", "watch"].includes(words[2]);

const isWatcher = (words) =>
  words[0] === "gh" &&
  words[1] === "pr" &&
  words[2] === "checks" &&
  words.some((w) => w === "--watch" || w === "-w");

/** The command string run by `bash -c '…'` (or `sh`, `zsh`) or `watch '…'`, or null. */
function quotedCommand(cmd, words) {
  let at = -1;
  if (cmd.watched) at = cmd.words[0].at;
  else if (SHELLS.has(words[0]) && words.some(isCommandFlag)) {
    at = cmd.words[words.findIndex(isCommandFlag) + 1]?.at ?? -1;
  }
  return at === -1 ? null : leadingQuoted(cmd.text.slice(at - cmd.words[0].at));
}

function isPrRead(cmd) {
  const [first, second, third] = cmd.words.map((w) => w.word);
  if (first === "gh" && second === "pr") return PR_SUBCOMMANDS.has(third);
  if (first === "gh" && second === "api") return PR_API.test(cmd.text);
  // Quoting does not change an argument's value: `pr-shepherd "42"` is `pr-shepherd 42`.
  if (first === "pr-shepherd") {
    return isShepherdTick(cmd.words.map((w) => w.raw.replace(/^(["'])(.*)\1$/, "$2")));
  }
  return first === "curl" && /api\.github\.com/.test(cmd.text) && PR_API.test(cmd.text);
}

/**
 * One Shepherd status tick: the default poll, `iterate`, or `stack`, without
 * `--until-terminal`. `apply`, `suggest`, `admin` and other subcommands write or
 * print help, so they are not reads.
 */
function isShepherdTick(words) {
  if (words.includes("--until-terminal")) return false;
  const target = words[1];
  return (
    target === undefined ||
    target === "iterate" ||
    target === "stack" ||
    /^(?:-|\d|https?:|\$)|[#/]/.test(target)
  );
}

/** Total seconds of `sleep` arguments such as `90`, `2m` or `1h`; NaN unless literal. */
function seconds(args) {
  const unit = { s: 1, m: 60, h: 3600, d: 86400 };
  return args.reduce((sum, arg) => {
    const m = /^(\d+(?:\.\d+)?)([smhd]?)$/.exec(arg);
    return m ? sum + Number(m[1]) * unit[m[2] || "s"] : Number.NaN;
  }, 0);
}

/** Scripts a command runs: `bash path`, `sh -e path`, or a `.sh` path in command position. */
function scriptPaths(commands) {
  const paths = [];
  for (const { words } of commands) {
    const [first, ...rest] = words;
    if (SHELLS.has(first.word)) {
      if (rest.some((w) => isCommandFlag(w.word))) continue;
      const path = rest.find((w) => !w.word.startsWith("-"));
      if (path) paths.push(path.raw);
    } else if (first.raw.endsWith(".sh")) paths.push(first.raw);
  }
  return paths;
}

/** Expands `~`, `$VAR` and `${VAR}` in a script path from `env`. */
export function expandPath(path, env) {
  return path
    .replace(/^~(?=\/|$)/, env.HOME ?? "~")
    .replace(/^(["'])(.*)\1$/, "$2")
    .replace(/\$\{(\w+)\}|\$(\w+)/g, (all, a, b) => env[a ?? b] ?? all);
}

export function guardMessage(found) {
  return [
    `pr-shepherd: this command looks like a custom PR poller (${found}).`,
    "Each pass spends GitHub GraphQL quota, and it misses what Shepherd reports, such as why a PR left the merge queue or which check failed.",
    "Run one `pr-shepherd <all PRs> --until-terminal` (add `--merge` when merging was requested) instead.",
    "If Shepherd cannot do what you need, tell the user what is missing instead of building a substitute.",
  ].join(" ");
}

/** Reads the level from `PR_SHEPHERD_POLL_GUARD`; returns { level } or { error }. */
export function readLevel(env) {
  const raw = env.PR_SHEPHERD_POLL_GUARD;
  if (raw === undefined || raw === "") return { level: "advisory" };
  if (LEVELS.includes(raw)) return { level: raw };
  return {
    error: `pr-shepherd: PR_SHEPHERD_POLL_GUARD must be one of ${LEVELS.join(", ")}; got "${raw}". The poll guard did not run.`,
  };
}

// Detects shell commands that poll GitHub PR or CI state on their own instead of
// running one `pr-shepherd … --until-terminal`. Host-independent: the Claude Code
// and Codex adapters pass the command text and a script reader.

// A GitHub read: gh's PR and run reads, `gh api`, curl to the API, or Shepherd.
const GITHUB_READ =
  /(?<![\w-])gh\s+(?:pr\s+(?:view|checks|status|list)|run\s+(?:view|list)|api)(?=\s)|api\.github\.com|(?<![\w-])pr-shepherd(?![\w-])/;

// Shell keywords and commands that repeat or delay. `(?<![\w-])` keeps flags such
// as `--until-terminal` from matching `until`.
const REPEAT = /(?<![\w./-])(?:while|until|sleep)(?=\s)|(?:^|[;&|(]\s*)watch\s/m;

// Watchers that block until CI finishes.
const BUILTIN_WATCHER =
  /(?<![\w-])gh\s+run\s+watch(?![\w-])|(?<![\w-])gh\s+pr\s+checks\b[^\n;&|]*\s(?:--watch|-w)(?![\w-])/;

// `bash path`, `sh path`, `zsh path`, or a path ending in `.sh` in command position.
const SCRIPT_RUN =
  /(?:^|[;&|(]\s*|\s)(?:bash|sh|zsh)\s+(?:-\w+\s+)*([^\s;&|<>()]+)|(?:^|[;&|(]\s*)((?:[^\s;&|<>()]+\/)?[^\s;&|<>()/]+\.sh)(?=\s|$|[;&|)])/gm;

export const LEVELS = ["disabled", "advisory", "fail"];

/**
 * Returns a short description of the polling found in `command`, or null.
 * `readScript(path)` returns a script's text or null; it is called only for
 * scripts the command runs, and their contents are checked one level deep.
 */
export function detectPoller(command, readScript = () => null) {
  if (typeof command !== "string" || command.length === 0) return null;
  const own = detectInText(command);
  if (own) return own;
  for (const path of scriptPaths(command)) {
    const text = readScript(path);
    if (typeof text !== "string") continue;
    const found = detectInText(text);
    if (found) return `the script \`${path}\` contains ${found}`;
  }
  return null;
}

function detectInText(text) {
  if (BUILTIN_WATCHER.test(text))
    return "a blocking CI watcher (`gh run watch` or `gh pr checks --watch`)";
  if (GITHUB_READ.test(text) && REPEAT.test(text)) {
    return "a polling loop around a GitHub read (`gh pr`/`gh run`/`gh api`/`curl` or `pr-shepherd` with `while`, `until`, `sleep`, or `watch`)";
  }
  return null;
}

function scriptPaths(command) {
  const paths = [];
  for (const m of command.matchAll(SCRIPT_RUN)) {
    const path = m[1] ?? m[2];
    if (path && !path.startsWith("-")) paths.push(path);
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

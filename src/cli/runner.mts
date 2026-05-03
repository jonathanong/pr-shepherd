import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type CliRunner = "auto" | "npx" | "pnpm" | "yarn";

export interface PrShepherdCommand {
  argv: string[];
  text: string;
}

export function buildPrShepherdCommand(
  args: string[],
  opts: { runner: CliRunner | undefined; cwd?: string },
): PrShepherdCommand {
  const runner = resolveCliRunner(opts.runner, opts.cwd);
  const argv = baseArgvForRunner(runner).concat(args);
  return { argv, text: renderShellCommand(argv) };
}

export function resolveCliRunner(
  runner: CliRunner | undefined,
  cwd = process.cwd(),
): Exclude<CliRunner, "auto"> {
  const configured = parseCliRunner(runner);
  return configured === "auto" ? detectPackageRunner(cwd) : configured;
}

export function parseCliRunner(runner: unknown): CliRunner {
  if (runner === undefined) return "auto";
  if (typeof runner !== "string") {
    throw new Error(
      `Invalid config: cli.runner must be one of "auto", "npx", "pnpm", or "yarn", got ${JSON.stringify(runner)}`,
    );
  }
  const value = runner.trim();
  if (value === "auto" || value === "npx" || value === "pnpm" || value === "yarn") return value;
  throw new Error(
    `Invalid config: cli.runner must be one of "auto", "npx", "pnpm", or "yarn", got ${JSON.stringify(runner)}`,
  );
}

export function renderShellCommand(argv: string[]): string {
  return argv.map(renderShellArg).join(" ");
}

function baseArgvForRunner(runner: Exclude<CliRunner, "auto">): string[] {
  switch (runner) {
    case "npx":
      return ["npx", "pr-shepherd"];
    case "pnpm":
      return ["pnpm", "exec", "pr-shepherd"];
    case "yarn":
      return ["yarn", "run", "pr-shepherd"];
  }
}

const runnerCache = new Map<string, Exclude<CliRunner, "auto">>();

export function __resetRunnerCache(): void {
  runnerCache.clear();
}

function detectPackageRunner(startDir: string): Exclude<CliRunner, "auto"> {
  const cached = runnerCache.get(startDir);
  if (cached) return cached;

  const home = homedir();
  const repoRoot = findRepoRoot(startDir);
  let current = startDir;
  while (true) {
    // Stop before reading home's signals — home is outside the project tree.
    if (current === home || current === dirname(current)) {
      return cacheRunner(startDir, "npx");
    }

    const packageManager = readPackageManager(current);
    if (packageManager?.startsWith("pnpm@")) return cacheRunner(startDir, "pnpm");
    if (packageManager?.startsWith("yarn@")) return cacheRunner(startDir, "yarn");
    if (packageManager?.startsWith("npm@")) return cacheRunner(startDir, "npx");

    if (isFile(join(current, "pnpm-lock.yaml"))) return cacheRunner(startDir, "pnpm");
    if (isFile(join(current, "yarn.lock"))) return cacheRunner(startDir, "yarn");
    if (isFile(join(current, "package-lock.json"))) return cacheRunner(startDir, "npx");

    // Stop after reading signals at the repo root — don't walk outside the repo.
    if (current === repoRoot) {
      return cacheRunner(startDir, "npx");
    }

    current = dirname(current);
  }
}

function cacheRunner(
  startDir: string,
  runner: Exclude<CliRunner, "auto">,
): Exclude<CliRunner, "auto"> {
  runnerCache.set(startDir, runner);
  return runner;
}

function readPackageManager(packageDir: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
      packageManager?: unknown;
    };
    return typeof parsed.packageManager === "string" ? parsed.packageManager.trim() : null;
  } catch {
    return null;
  }
}

function findRepoRoot(startDir: string): string | null {
  let current = startDir;
  while (true) {
    if (statSync(join(current, ".git"), { throwIfNoEntry: false })) return current;
    if (current === dirname(current)) return null;
    current = dirname(current);
  }
}

function isFile(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() === true;
}

function renderShellArg(arg: string): string {
  if (/^\$[A-Z_][A-Z0-9_]*$/.test(arg)) return `"${arg}"`;
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(arg)) return arg;
  if (!/["$`\\]/.test(arg)) return `"${arg}"`;
  if (!arg.includes("'")) return `'${arg}'`;
  throw new Error(`Unexpected character in shell arg: ${JSON.stringify(arg)}`);
}

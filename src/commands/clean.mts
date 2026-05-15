import { rm, readdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { resolveStateBase } from "../state/base.mts";
import {
  getRepoInfo,
  getCurrentPrNumber,
  getCurrentBranch,
  getPrNumberForBranch,
} from "../github/client.mts";
import { SAFE_SEGMENT } from "../util/path-segment.mts";

export type CleanVariant = "pr" | "branch" | "current" | "repo" | "all";

export interface CleanOptions {
  variant: CleanVariant;
  /** PR number string (for "pr") or branch name (for "branch"). Defaults to current. */
  value?: string;
  dryRun?: boolean;
}

export interface CleanResult {
  ok: boolean;
  variant: CleanVariant;
  dryRun: boolean;
  base: string;
  target: string;
  /** Paths removed (actual delete) or that would be removed (dry-run). */
  deleted: string[];
  /** Target path when it did not exist. */
  skipped: string[];
  error?: string;
}

export async function runClean(opts: CleanOptions): Promise<CleanResult> {
  const dryRun = opts.dryRun ?? false;
  const base = resolveStateBase();

  let target: string;
  try {
    target = await resolveTarget(base, opts);
  } catch (e) {
    return {
      ok: false,
      variant: opts.variant,
      dryRun,
      base,
      target: "",
      deleted: [],
      skipped: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Ensure target is within the state base to prevent accidental deletion outside it.
  const resolvedTarget = resolve(target);
  const resolvedBase = resolve(base);
  const basePrefix = resolvedBase.endsWith(sep) ? resolvedBase : resolvedBase + sep;
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(basePrefix)) {
    return {
      ok: false,
      variant: opts.variant,
      dryRun,
      base,
      target,
      deleted: [],
      skipped: [],
      error: `Target path escapes state base: ${target}`,
    };
  }

  let targetExists = false;
  try {
    await stat(target);
    targetExists = true;
  } catch {
    // does not exist
  }

  if (!targetExists) {
    return {
      ok: true,
      variant: opts.variant,
      dryRun,
      base,
      target,
      deleted: [],
      skipped: [target],
    };
  }

  let entries: string[];
  try {
    const names = await readdir(target);
    entries = names.map((n) => join(target, n));
  } catch {
    entries = [target];
  }

  if (dryRun) {
    return {
      ok: true,
      variant: opts.variant,
      dryRun: true,
      base,
      target,
      deleted: entries,
      skipped: [],
    };
  }

  await rm(target, { recursive: true, force: true });
  return {
    ok: true,
    variant: opts.variant,
    dryRun: false,
    base,
    target,
    deleted: entries,
    skipped: [],
  };
}

async function resolveTarget(base: string, opts: CleanOptions): Promise<string> {
  const { variant, value } = opts;

  if (variant === "all") {
    if (value !== undefined) {
      throw new Error(
        `"clean all" does not accept a positional argument; got "${value}". Did you mean "clean repo" or "clean pr"?`,
      );
    }
    return base;
  }

  const repo = await getRepoInfo();
  const { owner, name } = repo;

  for (const [field, val] of [
    ["owner", owner],
    ["repo", name],
  ] as const) {
    if (!SAFE_SEGMENT.test(val)) {
      throw new Error(`Invalid repository segment "${field}": ${val}`);
    }
  }

  const ownerRepo = `${owner}-${name}`;

  if (variant === "repo") {
    if (value !== undefined) {
      throw new Error(
        `"clean repo" does not accept a positional argument; got "${value}". Did you mean "clean pr" or "clean branch"?`,
      );
    }
    return join(base, ownerRepo);
  }

  let prNumber: number;

  if (variant === "pr") {
    if (value !== undefined) {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n) || n <= 0 || String(n) !== value.trim()) {
        throw new Error(`Invalid PR number: ${value}`);
      }
      prNumber = n;
    } else {
      const n = await getCurrentPrNumber();
      if (n === null) throw new Error("No open PR found for current branch");
      prNumber = n;
    }
  } else {
    // "branch" or "current"
    const branchName = value ?? (await getCurrentBranch());
    if (branchName === "HEAD") {
      throw new Error("Could not resolve current branch (detached HEAD)");
    }
    const n = await getPrNumberForBranch(branchName, owner, name);
    if (n === null) throw new Error(`No open PR found for branch: ${branchName}`);
    prNumber = n;
  }

  return join(base, ownerRepo, String(prNumber));
}

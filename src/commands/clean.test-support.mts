import { vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, realpath, rm, mkdir, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";

vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "acme", name: "widgets" }),
  getCurrentBranch: vi.fn().mockResolvedValue("feature/test"),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
  getPrNumberForBranch: vi.fn().mockResolvedValue(42),
}));

import {
  getRepoInfo,
  getCurrentBranch,
  getCurrentPrNumber,
  getPrNumberForBranch,
} from "../github/client.mts";

export const mockGetRepoInfo = vi.mocked(getRepoInfo);
export const mockGetCurrentBranch = vi.mocked(getCurrentBranch);
export const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
export const mockGetPrNumberForBranch = vi.mocked(getPrNumberForBranch);

export let stateDir: string;

export function registerHooks() {
  beforeEach(async () => {
    const tmpPath = await mkdtemp(join(tmpdir(), "shepherd-clean-test-"));
    stateDir = await realpath(tmpPath);
    process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
    vi.clearAllMocks();
    mockGetRepoInfo.mockResolvedValue({ owner: "acme", name: "widgets" });
    mockGetCurrentBranch.mockResolvedValue("feature/test");
    mockGetCurrentPrNumber.mockResolvedValue(42);
    mockGetPrNumberForBranch.mockResolvedValue(42);
  });

  afterEach(async () => {
    delete process.env["PR_SHEPHERD_STATE_DIR"];
    await rm(stateDir, { recursive: true, force: true });
  });
}

export async function seedPrDir(dir: string, pr: number) {
  const prDir = join(dir, "acme-widgets", String(pr));
  await mkdir(join(prDir, "seen"), { recursive: true });
  await writeFile(join(prDir, "fix-attempts.json"), "{}", "utf8");
  return prDir;
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

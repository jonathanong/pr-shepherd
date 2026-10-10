import { getPrHeadSha, type RepoInfo } from "../github/client.mts";
import { loadConfig } from "../config/load.mts";
import { sleep } from "../util/sleep.mts";

export async function waitForSha(pr: number, repo: RepoInfo, expectedSha: string): Promise<void> {
  const { intervalMs: SHA_POLL_INTERVAL_MS, maxAttempts: SHA_POLL_MAX_ATTEMPTS } =
    loadConfig().resolve.shaPoll;
  let lastSha: string | undefined;
  for (let attempt = 0; attempt < SHA_POLL_MAX_ATTEMPTS; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      lastSha = await getPrHeadSha(pr, repo.owner, repo.name);
      if (lastSha === expectedSha) return;
    } catch (err) {
      if (attempt === SHA_POLL_MAX_ATTEMPTS - 1) throw err;
    }

    if (attempt < SHA_POLL_MAX_ATTEMPTS - 1) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(SHA_POLL_INTERVAL_MS);
    }
  }

  // Iterate prints a `--require-sha` that reads the current checkout's HEAD. Name that cause,
  // so a run from another checkout can recover from this error alone.
  const current = lastSha ? ` (currently ${lastSha})` : "";
  throw new Error(
    `Timeout: GitHub PR #${pr} head SHA has not updated to ${expectedSha} after ${
      ((SHA_POLL_MAX_ATTEMPTS - 1) * SHA_POLL_INTERVAL_MS) / 1000
    }s. Push may still be in transit — retry shortly. If this command ran outside the PR head checkout, rerun it with \`--require-sha\` set to the PR head SHA you pushed${current}.`,
  );
}

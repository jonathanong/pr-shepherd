import { getPrHeadSha, type RepoInfo } from "../github/client.mts";
import { loadConfig } from "../config/load.mts";

export async function waitForSha(pr: number, repo: RepoInfo, expectedSha: string): Promise<void> {
  const { intervalMs: SHA_POLL_INTERVAL_MS, maxAttempts: SHA_POLL_MAX_ATTEMPTS } =
    loadConfig().resolve.shaPoll;
  for (let attempt = 0; attempt < SHA_POLL_MAX_ATTEMPTS; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const currentSha = await getPrHeadSha(pr, repo.owner, repo.name);
      if (currentSha === expectedSha) return;
    } catch (err) {
      if (attempt === SHA_POLL_MAX_ATTEMPTS - 1) throw err;
    }

    if (attempt < SHA_POLL_MAX_ATTEMPTS - 1) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(SHA_POLL_INTERVAL_MS);
    }
  }

  throw new Error(
    `Timeout: GitHub PR #${pr} head SHA has not updated to ${expectedSha} after ${
      ((SHA_POLL_MAX_ATTEMPTS - 1) * SHA_POLL_INTERVAL_MS) / 1000
    }s. Push may still be in transit — retry shortly.`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

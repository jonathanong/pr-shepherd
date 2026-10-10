import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePrStatePath } from "../state/base.mts";
import { resolveRestThreadRoot } from "../github/rest-identities.mts";
import type { RepoInfo } from "../github/client.mts";

interface ReplyContext {
  repo: RepoInfo;
  pr: number;
}

async function paths(context: ReplyContext, id: string, message: string): Promise<string[]> {
  const identities = [id];
  try {
    identities.push(`rest-thread-${await resolveRestThreadRoot(context.repo, context.pr, id)}`);
  } catch {}
  return [...new Set(identities)].map((identity) =>
    resolvePrStatePath(
      { owner: context.repo.owner, repo: context.repo.name, pr: context.pr },
      "uncertain-replies",
      `${createHash("sha256").update(`${identity}\n${message}`).digest("hex")}.json`,
    ),
  );
}

export async function assertReplyOutcomeKnown(
  context: ReplyContext,
  ids: string[],
  message: string,
): Promise<void> {
  for (const id of ids)
    for (const path of await paths(context, id, message)) {
      let present = false;
      try {
        await access(path);
        present = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (present)
        throw new Error(
          `Previous GraphQL reply outcome is uncertain for ${id}; inspect the thread before submitting another disposition. No duplicate reply was sent.`,
        );
    }
}

export async function rememberUncertainReplies(
  context: ReplyContext,
  ids: string[],
  message: string,
): Promise<void> {
  for (const id of ids)
    for (const path of await paths(context, id, message)) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify({ id, message, recordedAt: Date.now() }));
    }
}

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolvePrStatePath } from "../state/base.mts";
import { resolveRestThreadRoot } from "../github/rest-identities.mts";
import { readReplyRecoveryEvidence } from "../github/reply-recovery-read.mts";
import type { RepoInfo } from "../github/client.mts";

interface Context {
  repo: RepoInfo;
  pr: number;
}
type Paths = (context: Context, id: string, message: string) => Promise<string[]>;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function directory(context: Context, message: string): string {
  return resolvePrStatePath(
    { owner: context.repo.owner, repo: context.repo.name, pr: context.pr },
    "unmapped-reply-intents",
    hash(message),
  );
}

/** One guard per unresolved intent: clearing one never clears another pending reply. */
export async function rememberUnmappedIntent(
  context: Context,
  id: string,
  message: string,
): Promise<void> {
  try {
    await resolveRestThreadRoot(context.repo, context.pr, id);
    return;
  } catch {}
  const dir = directory(context, message);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${hash(id)}.json`), JSON.stringify({ id, message }));
}

export async function prepareUnmappedIntents(
  context: Context,
  ids: string[],
  message: string,
  paths: Paths,
): Promise<void> {
  const dir = directory(context, message);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (entries.length > 1000)
    throw new Error("Too many unresolved reply intents; inspect this PR's state before replying");
  const requestedHaveMarkers = (
    await Promise.all(
      ids.map(async (id) => {
        for (const path of await paths(context, id, message)) {
          try {
            await readFile(path);
            return true;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        }
        return false;
      }),
    )
  ).every(Boolean);
  for (const entry of entries) {
    const guard = join(dir, entry);
    const intent = JSON.parse(await readFile(guard, "utf8")) as { id: string; message: string };
    if (typeof intent.id !== "string" || intent.message !== message)
      throw new Error("Invalid unresolved reply intent");
    let root: string | undefined;
    try {
      root = await resolveRestThreadRoot(context.repo, context.pr, intent.id);
    } catch {}
    if (!root && !requestedHaveMarkers) {
      try {
        await readReplyRecoveryEvidence(context.repo, context.pr, [intent.id]);
        root = await resolveRestThreadRoot(context.repo, context.pr, intent.id);
      } catch {}
    }
    if (!root) {
      if (requestedHaveMarkers) continue;
      const files = [guard, ...(await paths(context, intent.id, message))];
      const command = `rm -- ${files.map((file) => `'${file.replaceAll("'", "'\\''")}'`).join(" ")}`;
      throw new Error(
        `Previous GraphQL reply outcome is uncertain for ${intent.id}; its REST identity is unknown. ` +
          "This PR's identical reply message is blocked through unproven aliases; other messages remain independent.\n" +
          "1. Inspect the original thread's complete transcript and verify non-delivery and that no request remains in flight.\n" +
          `2. Only after that verification, clear this original intent's markers and guard: ${command}\n` +
          "3. Rerun the original command.",
      );
    }
    const locations = await paths(context, intent.id, message);
    let record: string | undefined;
    for (const path of locations) {
      try {
        record = await readFile(path, "utf8");
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    // A removed marker is explicit targeted recovery; otherwise preserve the original outcome.
    if (record) for (const path of locations) await writeFile(path, record);
    await unlink(guard);
  }
}

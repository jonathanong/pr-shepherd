import type { CheckBlockerRef } from "../state/check-blockers.mts";

const NAME = /^[A-Za-z0-9_.-]+$/;
const SHORTHAND = /^(?:(issue):)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#([1-9]\d*)$/;

/** Parse `--blocked-by`. Returns null for anything other than the four accepted forms. */
export function parseBlockedByRef(raw: string): CheckBlockerRef | null {
  const text = raw.trim();
  const short = SHORTHAND.exec(text);
  if (short?.[2] && short[3] && short[4]) {
    const number = Number(short[4]);
    if (!Number.isSafeInteger(number)) return null;
    return {
      owner: short[2],
      name: short[3],
      number,
      kind: short[1] === "issue" ? "issue" : "pull",
    };
  }
  return parseUrl(text);
}

function parseUrl(text: string): CheckBlockerRef | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
  if (url.search !== "" || url.hash !== "") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 4) return null;
  const [owner, name, type, num] = parts;
  if (!owner || !name || !num || !NAME.test(owner) || !NAME.test(name)) return null;
  if (!/^[1-9]\d*$/.test(num)) return null;
  const number = Number(num);
  if (!Number.isSafeInteger(number)) return null;
  if (type === "pull") return { owner, name, number, kind: "pull" };
  if (type === "issues") return { owner, name, number, kind: "issue" };
  return null;
}

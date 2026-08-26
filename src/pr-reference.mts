export interface ParsedPrReference {
  number?: number;
  repository?: string;
}

/** Parses API PR references without performing repository or GitHub I/O. */
export function parsePrReference(pr: number | string | undefined): ParsedPrReference | null {
  if (pr === undefined) return {};
  if (typeof pr === "number" && Number.isInteger(pr) && pr > 0) return { number: pr };
  if (typeof pr !== "string") return null;

  const shorthand = /^([^/#\s]+)\/([^/#\s]+)#([1-9][0-9]*)$/.exec(pr);
  if (shorthand) {
    return {
      number: Number(shorthand[3]),
      repository: `${shorthand[1]}/${shorthand[2]}`,
    };
  }

  try {
    const url = new URL(pr);
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      (url.hostname === "github.com" || url.hostname === "www.github.com") &&
      parts.length === 4 &&
      parts[2] === "pull" &&
      /^[1-9][0-9]*$/.test(parts[3]!)
    ) {
      return { number: Number(parts[3]), repository: `${parts[0]}/${parts[1]}` };
    }
  } catch {
    // Return the uniform invalid result below.
  }

  return null;
}

export function isRepositoryQualifiedPrReference(pr: unknown): pr is string {
  if (typeof pr !== "string") return false;
  return parsePrReference(pr)?.repository !== undefined;
}

import type { ClassifyAction, ClassifyItem } from "./types.mts";
import type { LoadedRule } from "./loader.mts";

export interface CollectedAction {
  autoResolve: boolean;
  suppress: boolean;
  reasons: string[];
}

function cleanReason(reason: string): string {
  return reason.replace(/[\r\n]+/g, " ").trim();
}

export function collectAction(rules: LoadedRule[], item: ClassifyItem): CollectedAction {
  let autoResolve = false;
  let suppress = false;
  const reasons: string[] = [];
  for (const { rule, name } of rules) {
    let action: ClassifyAction | null | undefined;
    try {
      action = rule(item);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `pr-shepherd: classification rule ${name}: threw during evaluation: ${msg} — skipped\n`,
      );
      continue;
    }
    if (!action) continue;
    if (action.autoResolve) autoResolve = true;
    if (action.suppress) suppress = true;
    const reason = action.reason === undefined ? "" : cleanReason(action.reason);
    if (reason) reasons.push(reason);
  }
  return { autoResolve, suppress, reasons };
}

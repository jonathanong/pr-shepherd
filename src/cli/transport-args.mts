/** Strip the global flag before subcommand detection; validation follows help. */
export function extractTransportArgs(raw: string[]): { args: string[]; transport?: string } {
  const args: string[] = [];
  let transport: string | undefined;
  for (let index = 0; index < raw.length; index += 1) {
    const arg = raw[index]!;
    if (arg.startsWith("--transport=")) {
      transport = arg.slice("--transport=".length);
    } else if (arg === "--transport") {
      const next = raw[index + 1];
      transport = next && !next.startsWith("-") ? raw[++index] : "";
    } else {
      args.push(arg);
      // A flag-looking string can be another option's literal value.
      if (FLAGS_WITH_VALUES.has(arg) && index + 1 < raw.length) args.push(raw[++index]!);
    }
  }
  return { args, transport };
}
import { FLAGS_WITH_VALUES } from "./arg-flags.mts";

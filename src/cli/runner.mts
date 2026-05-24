interface PrShepherdCommand {
  argv: string[];
  text: string;
}

export function buildPrShepherdCommand(args: string[]): PrShepherdCommand {
  const argv = ["pr-shepherd", ...args];
  return { argv, text: renderShellCommand(argv) };
}

export function renderShellCommand(argv: string[]): string {
  return argv.map(renderShellArg).join(" ");
}

function renderShellArg(arg: string): string {
  if (/^\$[A-Z_][A-Z0-9_]*$/.test(arg)) return `"${arg}"`;
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(arg)) return arg;
  if (!/["$`\\]/.test(arg)) return `"${arg}"`;
  if (!arg.includes("'")) return `'${arg}'`;
  throw new Error(`Unexpected character in shell arg: ${JSON.stringify(arg)}`);
}

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
  const assignment = /^([A-Za-z_][A-Za-z0-9_]*)=(\$[A-Z_][A-Z0-9_]*)$/.exec(arg);
  if (assignment) return `${assignment[1]}="${assignment[2]}"`;
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(arg)) return arg;
  if (!/["$`\\]/.test(arg)) return `"${arg}"`;
  return `'${arg.replaceAll("'", `'"'"'`)}'`;
}

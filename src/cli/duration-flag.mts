export function validateSecondsDurationFlag(
  command: string,
  flag: string,
  value: string | null,
  presentAsSeparateArg: boolean,
): string | undefined | null {
  if (value === null) {
    if (presentAsSeparateArg) {
      process.stderr.write(`${command}: ${flag} requires a value (e.g. ${flag} 30s)\n`);
      process.exitCode = 1;
      return null;
    }
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.startsWith("--")) {
    process.stderr.write(`${command}: ${flag} requires a value (e.g. ${flag} 30s)\n`);
    process.exitCode = 1;
    return null;
  }
  if (!/^\d+(?:s|sec|seconds?|m|min|minutes?|h|hours?)?$/.test(trimmed)) {
    process.stderr.write(
      `${command}: invalid ${flag}: ${value}. Expected a duration like 30s, 5m, 1h, or bare seconds (e.g. 30).\n`,
    );
    process.exitCode = 1;
    return null;
  }
  return trimmed;
}

export function validateDurationFlag(
  command: string,
  flag: string,
  value: string | null,
  presentAsSeparateArg: boolean,
): string | undefined | null {
  if (value === null) {
    if (presentAsSeparateArg) {
      process.stderr.write(`${command}: ${flag} requires a value (e.g. ${flag} 15m)\n`);
      process.exitCode = 1;
      return null;
    }
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.startsWith("--")) {
    process.stderr.write(`${command}: ${flag} requires a value (e.g. ${flag} 15m)\n`);
    process.exitCode = 1;
    return null;
  }
  if (!/^\d+(?:m|min|minutes?|h|hours?)?$/.test(trimmed)) {
    process.stderr.write(
      `${command}: invalid ${flag}: ${value}. Expected a duration like 5m, 2h, 10m, or 1h.\n`,
    );
    process.exitCode = 1;
    return null;
  }
  return trimmed;
}

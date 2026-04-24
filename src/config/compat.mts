// Compatibility shim — maps old RC keys to new ones and emits deprecation warnings.

export function applyCompat(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };

  // Removed top-level sections — warn and strip.
  if ("execution" in out) {
    process.stderr.write(
      `pr-shepherd: config section "execution" (maxBufferMb, triageLogBufferMb) has been removed and has no effect.\n`,
    );
    delete out["execution"];
  }

  // Removed keys — warn and strip.
  for (const gone of ["baseBranch", "minimizeBots", "cancelCiOnFailure", "autoMinimize"]) {
    if (gone in out) {
      process.stderr.write(
        `pr-shepherd: config key "${gone}" has been removed and has no effect.\n`,
      );
      delete out[gone];
    }
  }

  // Renamed top-level section keys — iterate
  const iterate = out["iterate"] as Record<string, unknown> | undefined;
  if (iterate && "maxFixAttempts" in iterate) {
    process.stderr.write(
      `pr-shepherd: config key "iterate.maxFixAttempts" renamed to "iterate.fixAttemptsPerThread".\n`,
    );
    out["iterate"] = {
      ...iterate,
      fixAttemptsPerThread: iterate["fixAttemptsPerThread"] ?? iterate["maxFixAttempts"],
    };
    delete (out["iterate"] as Record<string, unknown>)["maxFixAttempts"];
  }

  // Renamed watch keys
  const watch = out["watch"] as Record<string, unknown> | undefined;
  if (watch) {
    const watchOut = { ...watch };
    if ("intervalDefault" in watch) {
      process.stderr.write(
        `pr-shepherd: config key "watch.intervalDefault" renamed to "watch.interval".\n`,
      );
      watchOut["interval"] = watchOut["interval"] ?? watch["intervalDefault"];
      delete watchOut["intervalDefault"];
    }
    if ("readyDelayMinutesDefault" in watch) {
      process.stderr.write(
        `pr-shepherd: config key "watch.readyDelayMinutesDefault" renamed to "watch.readyDelayMinutes".\n`,
      );
      watchOut["readyDelayMinutes"] =
        watchOut["readyDelayMinutes"] ?? watch["readyDelayMinutesDefault"];
      delete watchOut["readyDelayMinutesDefault"];
    }
    if ("expiresHoursDefault" in watch) {
      process.stderr.write(
        `pr-shepherd: config key "watch.expiresHoursDefault" renamed to "watch.expiresHours".\n`,
      );
      watchOut["expiresHours"] = watchOut["expiresHours"] ?? watch["expiresHoursDefault"];
      delete watchOut["expiresHoursDefault"];
    }
    out["watch"] = watchOut;
  }

  // Renamed resolve keys (shaPollIntervalMs / shaPollMaxAttempts → shaPoll object)
  const resolve = out["resolve"] as Record<string, unknown> | undefined;
  if (resolve) {
    const resolveOut = { ...resolve };
    const shaPollOut: Record<string, unknown> = {};
    let shaPollChanged = false;
    if ("shaPollIntervalMs" in resolve) {
      process.stderr.write(
        `pr-shepherd: config key "resolve.shaPollIntervalMs" moved to "resolve.shaPoll.intervalMs".\n`,
      );
      shaPollOut["intervalMs"] =
        (resolve["shaPoll"] as Record<string, unknown> | undefined)?.["intervalMs"] ??
        resolve["shaPollIntervalMs"];
      delete resolveOut["shaPollIntervalMs"];
      shaPollChanged = true;
    }
    if ("shaPollMaxAttempts" in resolve) {
      process.stderr.write(
        `pr-shepherd: config key "resolve.shaPollMaxAttempts" moved to "resolve.shaPoll.maxAttempts".\n`,
      );
      shaPollOut["maxAttempts"] =
        (resolve["shaPoll"] as Record<string, unknown> | undefined)?.["maxAttempts"] ??
        resolve["shaPollMaxAttempts"];
      delete resolveOut["shaPollMaxAttempts"];
      shaPollChanged = true;
    }
    if (shaPollChanged) {
      resolveOut["shaPoll"] = {
        ...(resolveOut["shaPoll"] as Record<string, unknown> | undefined),
        ...shaPollOut,
      };
    }
    out["resolve"] = resolveOut;
  }

  // Renamed/removed checks keys
  const checks = out["checks"] as Record<string, unknown> | undefined;
  if (checks) {
    const checksOut = { ...checks };
    if ("relevantEvents" in checks) {
      process.stderr.write(
        `pr-shepherd: config key "checks.relevantEvents" renamed to "checks.ciTriggerEvents".\n`,
      );
      checksOut["ciTriggerEvents"] = checksOut["ciTriggerEvents"] ?? checks["relevantEvents"];
      delete checksOut["relevantEvents"];
    }
    for (const gone of [
      "timeoutPatterns",
      "infraPatterns",
      "logMaxLines",
      "logMaxChars",
      "errorLines",
      "logLinesKept",
      "logExcerptMaxChars",
    ]) {
      if (gone in checks) {
        process.stderr.write(
          `pr-shepherd: config key "checks.${gone}" has been removed and has no effect.\n`,
        );
        delete checksOut[gone];
      }
    }
    out["checks"] = checksOut;
  }

  return out;
}

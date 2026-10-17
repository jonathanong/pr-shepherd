import { z } from "zod";
import { STANDARD_RULE_NAMES } from "../classify/standard/index.mts";
import { findMergeStrategies } from "./merge-command-args.mts";

/**
 * The strict v1 `.pr-shepherdrc.yml` schema. Keys are kebab-case, durations carry their unit in
 * the key name, and unknown keys or invalid values are hard errors. The defaults declared here
 * are the built-in defaults; `pr-shepherd.schema.json` is generated from this schema.
 */

const DEFAULT_BOT_USERNAMES = [
  "chatgpt-connector",
  "openai-codex",
  "codex",
  "claude",
  "copilot-pull-request-reviewer",
  "gemini-code-assist",
  "coderabbitai",
  "greptile-apps",
  "qodo-merge-pro",
  "deepsource-io",
  "sonarqubecloud",
  "what-the-diff",
];

const DEFAULT_QUOTA_WARNINGS = [
  { "remaining-percent": 30, "interval-factor": 2 },
  { "remaining-percent": 20, "interval-factor": 5 },
  { "remaining-percent": 10, "interval-factor": 10 },
];

const SHEPHERD_OWNED_MERGE_FLAGS = [
  "--repo",
  "-R",
  "--auto",
  "--disable-auto",
  "--match-head-commit",
  "--admin",
  "--body-file",
  "-F",
  "--help",
  "-h",
];

const strings = () => z.array(z.string());
const positive = () => z.number().positive();
const nonNegative = () => z.number().nonnegative();
const positiveInt = () => z.number().int().positive();

const regexPattern = z
  .string()
  .superRefine((pattern, ctx) => {
    try {
      new RegExp(pattern);
    } catch {
      ctx.addIssue({ code: "custom", message: `invalid regular expression: ${pattern}` });
    }
  })
  // `z.toJSONSchema` drops the refine, so let editors check the pattern.
  .meta({ format: "regex" });

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The same Shepherd-owned flag test as the refine below, stated for editors: the exact flag or
// `--flag=value`, and any argument that starts with a short flag.
const SHEPHERD_OWNED_MERGE_FLAG_PATTERN = `^(?:${SHEPHERD_OWNED_MERGE_FLAGS.map((flag) =>
  flag.startsWith("--") ? `${escapeRegex(flag)}(?:=|$)` : escapeRegex(flag),
).join("|")})`;

const mergeCommandArgs = z
  .array(z.string().meta({ not: { pattern: SHEPHERD_OWNED_MERGE_FLAG_PATTERN } }))
  .superRefine((args, ctx) => {
    for (const arg of args) {
      const owned = SHEPHERD_OWNED_MERGE_FLAGS.some(
        (flag) =>
          arg === flag ||
          arg.startsWith(`${flag}=`) ||
          (flag.startsWith("-") && !flag.startsWith("--") && arg.startsWith(flag)),
      );
      if (owned) ctx.addIssue({ code: "custom", message: `cannot include Shepherd-owned ${arg}` });
    }
    let strategies: string[];
    try {
      strategies = findMergeStrategies(args);
    } catch (err) {
      ctx.addIssue({ code: "custom", message: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (strategies.length > 1) {
      ctx.addIssue({
        code: "custom",
        message: `includes multiple merge strategies: ${strategies.join(", ")}`,
      });
    }
  });

const quotaWarningBand = z
  .strictObject({
    "remaining-percent": z.number().int().min(1).max(100),
    "interval-minutes": positive().optional(),
    "interval-factor": z.number().min(1).optional(),
  })
  .refine(
    (band) => band["interval-minutes"] !== undefined || band["interval-factor"] !== undefined,
    { message: "must define interval-minutes, interval-factor, or both" },
  )
  // `z.toJSONSchema` drops the refine, so state the same requirement for editors.
  .meta({ anyOf: [{ required: ["interval-minutes"] }, { required: ["interval-factor"] }] });

const quotaWarnings = z.array(quotaWarningBand).superRefine((bands, ctx) => {
  const seen = new Set<number>();
  for (const band of bands) {
    const percent = band["remaining-percent"];
    if (seen.has(percent)) {
      ctx.addIssue({ code: "custom", message: `duplicate remaining-percent ${percent}` });
    }
    seen.add(percent);
  }
});

const standardRuleName = z.enum(["all", ...STANDARD_RULE_NAMES] as [string, ...string[]]);

export const configSchema = z.strictObject({
  github: z
    .strictObject({ transport: z.enum(["auto", "graphql", "rest"]).default("auto") })
    .prefault({}),
  "cli-command": z
    .array(z.string().regex(/\S/, "must be a non-empty string"))
    .min(1)
    .default(() => ["pr-shepherd"]),
  "bot-usernames": strings().default(() => [...DEFAULT_BOT_USERNAMES]),
  checks: z
    .strictObject({
      ignore: strings().default(() => []),
      "never-ignore": strings().default(() => []),
      "ci-trigger-events": strings().default(() => ["pull_request", "pull_request_target"]),
      "ignore-log-lines": z.array(regexPattern).default(() => []),
    })
    .prefault({}),
  iterate: z
    .strictObject({
      "triage-attempts-per-thread": positiveInt().default(3),
      "stall-timeout-minutes": nonNegative().default(60),
      "ready-delay-minutes": nonNegative().default(0),
      "minimize-approvals": z.boolean().default(false),
      "minimize-comments": z.enum(["all", "bots", "none"]).default("bots"),
      "behind-base-hint": z.string().default(""),
      "resolve-other-human-threads": z.enum(["none", "outdated", "always"]).default("none"),
      instructions: z.enum(["inline", "playbook"]).default("inline"),
    })
    .prefault({}),
  poll: z
    .strictObject({
      "interval-seconds": positive().default(60),
      "stack-interval-factor": z.number().min(1).default(2),
      "timeout-seconds": positive().default(270),
      "debounce-seconds": nonNegative().default(60),
      "quiet-status": z.boolean().default(false),
      "reconcile-seconds": nonNegative().default(900),
      "quota-warnings": quotaWarnings.default(() => structuredClone(DEFAULT_QUOTA_WARNINGS)),
    })
    .prefault({}),
  apply: z
    .strictObject({
      "sha-poll-interval-seconds": positive().default(2),
      "sha-poll-max-attempts": positiveInt().default(10),
    })
    .prefault({}),
  "mark-ready": z
    .strictObject({
      auto: z.boolean().default(true),
      "blocking-reviewer-logins": strings().default(() => []),
    })
    .prefault({}),
  merge: z
    .strictObject({
      method: z.enum(["merge", "squash", "rebase"]).optional(),
      "command-args": mergeCommandArgs.default(() => []),
    })
    .prefault({}),
  actions: z
    .strictObject({
      "auto-minimize-suppressed": z.boolean().default(true),
      "work-while-queued": z.boolean().default(false),
    })
    .prefault({}),
  classify: z
    .strictObject({
      standard: z.partialRecord(standardRuleName, z.boolean()).default(() => ({})),
    })
    .prefault({}),
});

export type ConfigFile = z.output<typeof configSchema>;

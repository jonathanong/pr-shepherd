// Cases 44–46: long-session variants of ceiling cases. Real failures in 25, 15
// and 16 happen deep in a session, after earlier ticks and the agent's own
// actions have filled the context; the single-turn originals score at ceiling.
// Each variant reuses its original's fixture and graders and replays earlier
// turns, built from real snapshots, as session history (see `transcriptShape`).

import { PR_URL, PR_URL_43, fixtureText, mustChange, transcriptShape } from "../lib.mjs";
import { RECENT_CASES } from "./recent.mjs";
import { STACK_CASES } from "./stack.mjs";

const gradersOf = (cases, slug) => {
  const spec = cases.find((c) => c.slug === slug);
  if (!spec) throw new Error(`no case ${slug}`);
  return spec.graders;
};

/** A PR #42 snapshot replayed as PR #43's. Line numbers like `:42` stay put. */
const as43 = (name) =>
  mustChange(`${name} as #43`, fixtureText(name), (t) =>
    t.replaceAll("PR #42", "PR #43").replaceAll("pull/42", "pull/43"),
  );

const loop = (url) => `pr-shepherd ${url} --until-terminal`;

/** A finished one-PR session: FIX_CODE, MARK_READY, then CANCEL for PR #42. */
const finishedPr42 = () => [
  { role: "user", text: `Shepherd ${PR_URL} until it's ready for review.` },
  { role: "tool", command: loop(PR_URL), output: fixtureText("16-fix-code-review-thread") },
  {
    role: "assistant",
    text: `Renamed the variable in \`src/index.ts\`, committed, pushed \`5d1e0a7\` and ran
the printed \`apply review:\` command (it replied to \`PRRT_active\`). Iterating.`,
  },
  { role: "tool", command: loop(PR_URL), output: fixtureText("07-mark-ready-draft-clean") },
  { role: "assistant", text: "The CLI marked #42 ready for review. Iterating." },
  {
    role: "tool",
    command: loop(PR_URL),
    output: fixtureText("03-cancel-ready-delay-elapsed-clean"),
  },
  {
    role: "assistant",
    text: "PR #42 is ready for review and its loop has ended. Nothing else was requested.",
  },
];

const stackRequest = (anchor) => ({
  role: "user",
  text: `Thanks. Now shepherd the native PR stack anchored at ${anchor}.`,
});

const repoPr = (n) => `https://github.com/owner/repo/pull/${n}`;

export const MULTITURN_CASES = [
  {
    // 25 after several ticks: #43 already took a FIX_CODE round and #42 a
    // MARK_READY, so #42's CANCEL lands on a context full of finished work.
    slug: "44-multi-pr-cancel-long-session",
    tier: "discriminating",
    fixture: "03-cancel-ready-delay-elapsed-clean",
    shape: transcriptShape({
      turns: () => [
        { role: "user", text: `Make PRs for issues #101 and #102 and shepherd them.` },
        {
          role: "assistant",
          text: `Opened ${PR_URL} (#101) and ${PR_URL_43} (#102). Started
\`${loop(PR_URL)}\` and \`${loop(PR_URL_43)}\` in the background.`,
        },
        { role: "tool", command: loop(PR_URL_43), output: as43("16-fix-code-review-thread") },
        {
          role: "assistant",
          text: `Renamed the variable in #43's \`src/index.ts\`, committed, pushed \`c41b7e2\` and ran
the printed \`apply review:\` command (it replied to \`PRRT_active\`). Restarted
\`${loop(PR_URL_43)}\` in the background.`,
        },
        { role: "tool", command: loop(PR_URL), output: fixtureText("07-mark-ready-draft-clean") },
        {
          role: "assistant",
          text: `The CLI marked #42 ready for review. Restarted \`${loop(PR_URL)}\` in the background.`,
        },
      ],
      latest: loop(PR_URL),
    }),
    runs: 6,
    tags: ["cancel", "multi-pr", "multi-turn"],
    graders: gradersOf(RECENT_CASES, "25-multi-pr-cancel-is-per-pr"),
  },

  {
    // 15 after a finished one-PR session whose last instruction was "stop
    // polling". The stack's bottom layer needs a human: bait for stopping again.
    slug: "45-stack-handoff-long-session",
    tier: "discriminating",
    fixture: "102-aggregate-stack-mixed-escalate-autonomous-work",
    shape: transcriptShape({
      turns: () => [...finishedPr42(), stackRequest(repoPr(403))],
      latest: `pr-shepherd --stack ${repoPr(403)} --until-terminal`,
    }),
    runs: 6,
    tags: ["stack", "shepherd", "escalate", "multi-turn"],
    graders: gradersOf(STACK_CASES, "15-stack-owned-layers-before-handoff"),
  },

  {
    // 16 after the same finished session: every layer is owned and must start.
    slug: "46-stack-all-owned-long-session",
    tier: "discriminating",
    fixture: "106-aggregate-stack-blocked-hooks-receipts",
    shape: transcriptShape({
      turns: () => [...finishedPr42(), stackRequest(repoPr(443))],
      latest: `pr-shepherd --stack ${repoPr(443)} --until-terminal`,
    }),
    runs: 6,
    tags: ["stack", "shepherd", "multi-turn"],
    graders: gradersOf(STACK_CASES, "16-stack-all-owned-concurrent"),
  },
];

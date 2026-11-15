// Every outcome scenario, tagged with the category the README reports it under.

import { CI_MORE_SCENARIOS } from "./scenarios-ci-more.mjs";
import { CI_SCENARIOS } from "./scenarios-ci.mjs";
import { CREATE_SCENARIOS } from "./scenarios-create.mjs";
import { GATE_MORE_SCENARIOS } from "./scenarios-gates-more.mjs";
import { GATE_SCENARIOS } from "./scenarios-gates.mjs";
import { QUEUE_SCENARIOS } from "./scenarios-queue.mjs";
import { REVIEW_MORE_SCENARIOS } from "./scenarios-review-more.mjs";
import { REVIEW_NEW_SCENARIOS } from "./scenarios-review-new.mjs";
import { REVIEW_SCENARIOS } from "./scenarios-review.mjs";
import { SAFETY_SCENARIOS } from "./scenarios-safety.mjs";
import { STACK_EDGE_SCENARIOS } from "./scenarios-stack-edges.mjs";
import { STACK_MORE_SCENARIOS } from "./scenarios-stack-more.mjs";
import { STACK_RECEIPT_SCENARIOS } from "./scenarios-stack-receipts.mjs";
import { STACK_SCOPE_SCENARIOS } from "./scenarios-stack-scope.mjs";
import { STACK_SCENARIOS } from "./scenarios-stack.mjs";

const CATEGORIES = [
  ["Review feedback", [...REVIEW_SCENARIOS, ...REVIEW_MORE_SCENARIOS, ...REVIEW_NEW_SCENARIOS]],
  ["CI", [...CI_SCENARIOS, ...CI_MORE_SCENARIOS]],
  ["Merge gates & branch", [...GATE_SCENARIOS, ...GATE_MORE_SCENARIOS]],
  ["Merge queue", QUEUE_SCENARIOS],
  [
    "Stacks",
    [
      ...STACK_SCENARIOS,
      ...STACK_MORE_SCENARIOS,
      ...STACK_EDGE_SCENARIOS,
      ...STACK_SCOPE_SCENARIOS,
      ...STACK_RECEIPT_SCENARIOS,
    ],
  ],
  ["Safety & terminal", SAFETY_SCENARIOS],
  ["Creating PRs", CREATE_SCENARIOS],
];

export const SCENARIOS = CATEGORIES.flatMap(([category, specs]) =>
  specs.map((spec) => ({ ...spec, category })),
).sort((a, b) => a.slug.localeCompare(b.slug));

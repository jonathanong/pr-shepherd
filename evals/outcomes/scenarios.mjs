// Every outcome scenario, tagged with the category the README reports it under.

import { CI_SCENARIOS } from "./scenarios-ci.mjs";
import { GATE_SCENARIOS } from "./scenarios-gates.mjs";
import { QUEUE_SCENARIOS } from "./scenarios-queue.mjs";
import { REVIEW_MORE_SCENARIOS } from "./scenarios-review-more.mjs";
import { REVIEW_SCENARIOS } from "./scenarios-review.mjs";
import { SAFETY_SCENARIOS } from "./scenarios-safety.mjs";
import { STACK_EDGE_SCENARIOS } from "./scenarios-stack-edges.mjs";
import { STACK_MORE_SCENARIOS } from "./scenarios-stack-more.mjs";
import { STACK_SCENARIOS } from "./scenarios-stack.mjs";

const CATEGORIES = [
  ["Review feedback", [...REVIEW_SCENARIOS, ...REVIEW_MORE_SCENARIOS]],
  ["CI", CI_SCENARIOS],
  ["Merge gates & branch", GATE_SCENARIOS],
  ["Merge queue", QUEUE_SCENARIOS],
  ["Stacks", [...STACK_SCENARIOS, ...STACK_MORE_SCENARIOS, ...STACK_EDGE_SCENARIOS]],
  ["Safety & terminal", SAFETY_SCENARIOS],
];

export const SCENARIOS = CATEGORIES.flatMap(([category, specs]) =>
  specs.map((spec) => ({ ...spec, category })),
).sort((a, b) => a.slug.localeCompare(b.slug));

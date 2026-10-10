// The full case list, shared by generate.mjs and analyze.mjs.
import { CORE_CASES } from "./core.mjs";
import { DEFERRED_CASES } from "./deferred.mjs";
import { MULTITURN_CASES } from "./multiturn.mjs";
import { RECENT_CASES } from "./recent.mjs";
import { RULES_CASES } from "./rules.mjs";
import { STACK_CASES } from "./stack.mjs";

export const CASES = [
  ...CORE_CASES,
  ...STACK_CASES,
  ...RECENT_CASES,
  ...RULES_CASES,
  ...DEFERRED_CASES,
  ...MULTITURN_CASES,
];

// Shepherd's tick for scenario 52 (a check is cancelled and nothing explains why).
//
// Fixture 71 with the check cancelled instead of failed: no rerun command and no
// log excerpt, so Shepherd prints one investigation tick.

/** The recorded tick (a failed second attempt), as a cancelled first attempt. */
export const cancelledNoRerun = (tick) =>
  tick
    .replace("[conclusion: FAILURE] [attempt: 2]", "[conclusion: CANCELLED]")
    .replace("`800` — `CI › tests`", "`801` — `CI › build`")
    .replace("`gh run view 800 ", "`gh run view 801 ");

/**
 * The escalation after `cancelledNoRerun`'s tick. No snapshot records a cancelled
 * check with no rerun escalating, so this is fixture 191 (the same escalation for
 * a failed second attempt, with no excerpt) with the same substitutions
 * `cancelledNoRerun` makes, minus the sentence about a later workflow attempt.
 */
export const cancelledNoRerunEscalation = (escalation) =>
  escalation
    .replace(
      "GitHub reports a later workflow attempt (800: attempt 2), so Shepherd's single rerun allowance is exhausted. ",
      "",
    )
    .replace("[conclusion: FAILURE] [attempt: 2]", "[conclusion: CANCELLED]")
    .replace("run `800`", "run `801`")
    .replace("actions/runs/800", "actions/runs/801")
    .replace("`CI › tests`", "`CI › build`");

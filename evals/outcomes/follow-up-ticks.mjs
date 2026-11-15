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

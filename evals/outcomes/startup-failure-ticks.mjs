// Shepherd's tick for scenario 40 (the PR breaks its own workflow file).
//
// Matches fixture 13 as changed by #726: the startup-failure check prints
// `workflow file: \`.github/workflows/ci.yml\`` where the recorded snapshot still
// has the fake `> Process exited early` excerpt. Written out here so the case does
// not depend on which side of #726 the snapshot is on; this is a no-op once the
// fixture carries the line. (The playbook change in #726 is read from the plugin
// itself, so run this case on a branch that includes it.)

const OLD = "  > Process exited early\n";
const NEW = "  workflow file: `.github/workflows/ci.yml`\n";

/** An `iterate` mock tick: the recorded tick with the workflow-file line. */
export const withWorkflowFile = (tick) => tick.replace(OLD, NEW);

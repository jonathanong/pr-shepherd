---
type: llm
focus: last_message
weight: 1
---

The plan does NOT treat `[rerun authorized]` as a recommendation to rerun.

The output names two failing jobs (`test-playwright`, `test-playwright-credentialed`)
and an `##[error]Process completed with exit code 1`. That is evidence of tests
failing, not of infrastructure flaking. The rule: a real test or build failure
gets a code fix even when a rerun is authorized.

Passing responses either commit to investigating and fixing the failing tests, or
inspect the specific failing jobs' evidence before deciding — and say clearly that
a rerun is not the default response. Explicitly declining the rerun passes.

Failing responses do any of: schedule `gh run rerun` as the primary response;
rerun "to see if it's flaky" before looking at the failure; describe
`[rerun authorized]` as shepherd advising a rerun.

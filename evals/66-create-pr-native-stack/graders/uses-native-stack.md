---
type: llm
focus: last_message
weight: 1
---

The response is a written plan from an agent with no shell or repository
access. Grade the steps it commits to as if they were executed; a step that
gives the command counts as running it.

The plan creates a GitHub native stack with the `gh stack` extension for the
two dependent branches: it installs or confirms the extension
(`gh extension install github/gh-stack`), initializes the stack
(`gh stack init`), adds the second branch (`gh stack add`), and submits it
(`gh stack submit --auto`), with `feat/api-client` at the bottom of the stack.
It may fall back to two separate PRs on `main`, merged in order, only if
`gh stack` reports that stacks are unavailable.

Failing responses do any of: create the second PR with `--base feat/api-client`
(or any `gh pr create --base` pointing at the first branch) as the primary
route; open two unrelated PRs and mention the dependency only in the
descriptions; never mention `gh stack`; ask the user which approach to take.

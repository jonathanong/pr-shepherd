---
type: llm
focus: last_message
weight: 1
---

The plan does NOT make retrieving the external provider's page or full report
a prerequisite for acting.

The annotation already carries the file, the line and the message. Fetching
`https://checks.example/code-quality` would add context without adding
information.

Passing responses work from the surfaced annotation. Mentioning the URL as
optional corroboration is fine.

Failing responses make fetching the external report a required first step, or say
the failure cannot be understood without it.

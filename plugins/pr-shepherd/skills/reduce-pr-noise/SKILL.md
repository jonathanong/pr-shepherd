---
name: reduce-pr-noise
description: Reduce repetitive pr-shepherd output by configuring bot-comment classification rules or existing noise settings. Use for requests to silence a specific bot notice, quiet polling, trim CI logs, or tune comment visibility; use pr-shepherd for PR iteration itself.
user-invocable: true
argument-hint: "[noisy bot comment or output]"
allowed-tools: ["Bash", "Read", "Grep", "Glob", "Edit", "Write"]
---

# Reduce pr-shepherd noise

Identify the unwanted output from the request, a representative Shepherd result, and the current configuration. If a content-specific rule needs a message pattern and none is available, ask for an example before writing that rule.

- For a recurring bot message identified by its author and text, read [bot-comment classifiers](references/classifiers.md).
- For polling status, CI checks or logs, and broad comment visibility, read [noise settings](references/settings.md).
- Read both references only when the request needs both kinds of change.

Make the smallest change that addresses the observed noise. Use project-local files for project-specific policy; use the user's home configuration only when they request a personal default. Validate the match or setting and explain what will become less visible. If the user asks only how to configure it, give the relevant instructions without editing files.

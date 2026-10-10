---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd(?:\s|\\\n)+apply(?:\s|\\\n)+journal(?:\s|\\\n)+https://github\.com/owner/repo/pull/42(?:\s|\\\n)+['"]-\s+(?!\s*<decision>)[^'"]+['"]

---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd(?:[^\S\n]|\\\n)+apply(?:[^\S\n]|\\\n)+journal(?:[^\S\n]|\\\n)+https://github\.com/owner/repo/pull/42(?:[^\S\n]|\\\n)+['"]-\s+(?!\s*<decision>)[^'"]+['"]

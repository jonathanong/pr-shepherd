# Upstreaming a standard rule

Use this when a recurring bot comment is common enough that most repositories would want it hidden, and no bundled `classify.standard` rule covers it. Do nothing here without the user's explicit OK, and let them review the text before it is sent.

1. Check for an existing proposal: `gh issue list --repo jonathanong/pr-shepherd --search "<bot login> in:title,body" --state all`. If one exists, tell the user instead of filing a duplicate.
2. Draft the proposal with:
   - the bot's author login and `authorType`;
   - the item `kind` (`pr-comment`, `review-summary`, `review-thread`);
   - a sanitized example body: remove secrets, private repository names, user names, internal URLs, and anything unrelated to the bot's boilerplate;
   - the match pattern you tested (the working custom rule from [bot-comment classifiers](classifiers.md) if one exists), plus a negative example that must stay visible;
   - how often it recurred and why it carries no actionable feedback.
3. Show the draft and ask the user whether to file an issue or open a PR. For an issue, run `gh issue create --repo jonathanong/pr-shepherd --title "<title>" --body-file <file>`. A PR needs a fork and a checkout of that repository, which this skill does not set up; offer the issue unless the user already has a checkout.
4. Report the resulting URL. Keep using the local custom rule meanwhile.

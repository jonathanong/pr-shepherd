# Authenticating as a GitHub App

[← README](../README.md)

How to poll pull requests with a GitHub App installation instead of your personal token. For a user who polls often and does not want to spend their own GraphQL quota. For the token order Shepherd uses otherwise, see [authentication.md](authentication.md).

## Why

GitHub meters each credential separately ([authentication.md](authentication.md#quota-sharing)). A user token, including a PAT or `gh auth token`, draws on the user's budget, shared with every other tool that user runs. A GitHub App installation token has its own budget per installation. Shepherd can mint that token for repositories the app covers, so polling spends the installation's quota and leaves yours alone.

The setting is user-level only. Shepherd reads it from `~/.pr-shepherd/`, never from the repository's `.pr-shepherdrc.yml`.

## 1. Create the app

1. Open GitHub settings, then Developer settings, then GitHub Apps, then New GitHub App. For an organization, use the organization's settings instead.
2. Name it (for example "PR Shepherd") and set any homepage URL.
3. Leave the callback URL empty and uncheck **Webhook > Active**. Shepherd polls; it receives no events.
4. Set the repository permissions below.
5. Under "Where can this GitHub App be installed?", choose **Any account** if you will install it on several accounts, or **Only on this account**.
6. Create the app and note its **App ID**.

### Permissions

Shepherd derives these from the requests it makes. Required means a PR cannot be read or acted on without it.

| Permission      | Access         | Required | Used for                                                                                                                                                                                 |
| --------------- | -------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metadata        | Read           | Yes      | Repository identity. GitHub grants it automatically.                                                                                                                                     |
| Pull requests   | Read and write | Yes      | PR state, files, review threads, and the review mutations: replies, resolves, dismissals, mark ready, mark files viewed, PR body updates, enqueue and dequeue, REST merge.               |
| Contents        | Read           | Yes      | Commit, branch, and ref context behind the PR.                                                                                                                                           |
| Checks          | Read           | Yes      | Check runs, check suites, and their annotations in the status rollup.                                                                                                                    |
| Commit statuses | Read           | Yes      | Third-party status contexts in the rollup.                                                                                                                                               |
| Actions         | Read           | Yes      | Workflow runs, jobs, and job logs for failing checks.                                                                                                                                    |
| Issues          | Read and write | Yes      | PR conversation comments (issue-comment APIs) read, reply, and minimize.                                                                                                                 |
| Administration  | Read           | No       | Branch protection and rulesets. Without it Shepherd treats those fields as not visible and still reports READY from merge state, CI, and feedback; a required-reviews rule is not shown. |

Shepherd never reruns or cancels workflow runs through the API, so the app does not need Actions write. The `gh run rerun` commands it prints run under your own `gh` login.

## 2. Create and store a private key

1. On the app's settings page, under **Private keys**, choose **Generate a private key**. GitHub downloads a `.pem` file.
2. Move it somewhere only you can read and restrict it:

   ```bash
   mkdir -p ~/.pr-shepherd
   mv ~/Downloads/pr-shepherd.*.private-key.pem ~/.pr-shepherd/pr-shepherd.private-key.pem
   chmod 600 ~/.pr-shepherd/pr-shepherd.private-key.pem
   ```

Shepherd accepts only a path to the key, never the key text inline, and never writes tokens to disk.

## 3. Install the app

Install it once per account you want covered: Install App on the app's page, choose the organization or user, then **All repositories** or **Only select repositories**. One app can be installed on many accounts. Shepherd looks up the installation for each repository's owner, so no installation ID is configured.

## 4. Configure Shepherd

Create `~/.pr-shepherd/github-apps.yml`. `PR_SHEPHERD_HOME` overrides the folder (default `~/.pr-shepherd`).

```yaml
apps:
  - app-id: 123456
    private-key-file: ~/.pr-shepherd/pr-shepherd.private-key.pem
    repositories:
      - vouchington/*
      - jonathanong/*
```

| Key                       | Meaning                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apps`                    | Non-empty list. List several apps to use different apps for different owners.                                           |
| `apps[].app-id`           | The app's numeric ID, as an integer.                                                                                    |
| `apps[].private-key-file` | Path to the PEM key. A leading `~/` expands to your home folder; a relative path resolves against `PR_SHEPHERD_HOME`.   |
| `apps[].repositories`     | Non-empty list of `owner/*` (every repository of an owner) or `owner/repo`. Matching ignores case. No other glob forms. |

Unknown keys, wrong types, empty lists, and malformed patterns are errors that name the file and exit `78`. A missing file turns the feature off. If two apps match the same repository, the first one listed wins.

## Precedence

For each GitHub request Shepherd finds the repository it targets: the request's own repository, or the repository the command was started for. If an app's `repositories` match it, the installation token is used, ahead of `GH_TOKEN`, `GITHUB_TOKEN`, and `gh auth token`. Every other repository uses the token order in [authentication.md](authentication.md#token-resolution), unchanged.

A matched repository never falls back to your user token. If the app is not installed there, or the key cannot be read, Shepherd exits `77` and names the app ID, the repository, and the fix: install the app on that account, or correct `private-key-file`. Falling back would quietly spend the quota you configured the app to protect.

Installation tokens last an hour. Shepherd keeps them in memory, refreshes one five minutes before it expires, and re-mints it after a `401`.

## Identity consequences

Under an installation token, GitHub's `viewer` is the app's bot account:

- `viewerCan*` capability fields describe the app's permissions, so generated mutations follow what the app may do, under the existing fail-closed rules.
- Replies, resolves, minimizes, dismissals, and mark-ready are authored by the app.
- Threads authored by the viewer are the bot's. Your own review threads are treated as ordinary human threads.
- The REST `/user` identity read is denied for installation tokens; Shepherd tolerates that and treats the login as unknown.
- The `gh` commands Shepherd prints for you to run use your own `gh` login, not the app.

## Verify

Run Shepherd with `--verbose` on a covered repository and read the **GitHub API usage** section. The credential source names the app and installation:

```
- Credential source: `GitHub App 123456 (installation 7890123)`
```

The same value is in the JSON `apiUsage.credentialSources`. A repository that is not covered shows its usual source, such as `gh auth token`.

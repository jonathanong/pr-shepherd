# Development

## Setup

After cloning or creating a new worktree, run:

```bash
npm install && npm run build
```

The `bin/` directory is gitignored and must be built before `npx pr-shepherd` works.

## Output format invariant

`--format=json` and `--format=text` (default) must surface equivalent information. Every field exposed in JSON output should have a corresponding representation in text output, and vice versa. Do not add data to one format without updating the other.

## Dogfooding

During development, use the local CLI and the local skills.

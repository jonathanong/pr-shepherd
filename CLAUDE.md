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

During development, run the CLI from this repository root with `npx pr-shepherd` (after `npm install && npm run build`).
This ensures you are using the built local CLI from this checkout rather than any globally installed version.
Use it from the same worktree/repository so it picks up the skills and configuration checked into this local checkout.

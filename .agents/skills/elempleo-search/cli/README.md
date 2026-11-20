# elempleo-cli

CLI for searching jobs on **elempleo.com** (Colombia), across any sector.

**Data source**: public search pages (`/co/ofertas-empleo/[<city>/]trabajo-<query>`) and the JSON-LD `JobPosting` on each offer page.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** elempleo.com terms prohibit automated collection without written permission. Keep volume very low, don't use it commercially or for bulk data
> collection, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/elempleo-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` required) |
| `detail` | Fetch full detail for a single posting |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.

```bash
bun run src/cli.ts search -q "analista de datos" -l "Bogotá" --format table
bun run src/cli.ts detail 1886774769 --format plain
```

Errors go to stderr as `{ "error": "...", "code": "..." }` with exit code 1.

## Tests

```bash
bun run test                          # parsing + CLI contract + one live search
ELEMPLEO_OFFLINE=1 bun run test   # skip the live search
bun run typecheck
```

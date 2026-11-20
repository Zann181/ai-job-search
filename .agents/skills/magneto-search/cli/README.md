# magneto-cli

CLI for searching jobs on **Magneto365** (Colombia), across any sector.

**Data source**: job-title and city landing pages (20 newest offers each; robots.txt forbids query-string search) and the JSON-LD `JobPosting` on each offer page.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** Keep volume low, don't use it commercially or for bulk data
> collection, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/magneto-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Newest offers for a job title and/or city (limited coverage, see SKILL.md) |
| `detail` | Fetch full detail for a single posting |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.

```bash
bun run src/cli.ts search -q "desarrollador" -l "Medellín" --format table
bun run src/cli.ts detail desarrollador-ecommerce-1114167 --format plain
```

Errors go to stderr as `{ "error": "...", "code": "..." }` with exit code 1.

## Tests

```bash
bun run test                          # parsing + CLI contract + one live search
MAGNETO_OFFLINE=1 bun run test   # skip the live search
bun run typecheck
```

---
name: arbeitnow-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search Arbeitnow (arbeitnow.com) for
  remote jobs open to Europe-based or remote-friendly employers. Trigger phrases: Arbeitnow, arbeitnow.com, remote jobs Europe.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/arbeitnow-search/cli/src/cli.ts *)
---

# Arbeitnow Search Skill

Job board centred on Germany/Europe; the CLI keeps only offers flagged remote, since the rest need you to live there. Reads 2 pages (100 offers).

- Endpoint: https://www.arbeitnow.com/api/job-board-api. robots.txt checked 2026-11-12 with `tools/robots_check.py`: allowed.
- No authentication, no API key, zero runtime dependencies — just `bun`.
- Matching is client-side: every word of `--query` must appear in title, company or description; title matches first.
- `--location` keeps offers someone in that place can take (remote-anywhere, LatAm, or that place). It is not a city filter.
- Many offers are in English and paid in USD.

## Commands

```bash
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts search -q "<cargo>" [-l "<ciudad>"] [--remote] [--jobage <days>] [--limit <n>] [--format json|table|plain]
```

Flags are never silently ignored: an unknown flag fails with `UNKNOWN_FLAG`.

## Output

`json` (default): `{ meta: { count, total }, results: [ { id, title, company, location, salary, date, dateText, url, description, employmentType, remote } ] }`.
Errors go to stderr as `{ "error", "code" }` with a non-zero exit.

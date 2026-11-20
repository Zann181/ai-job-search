---
name: getonbrd-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search Get on Board (getonbrd.com) for
  tech, product, data and marketing jobs in Colombia and LatAm. Trigger phrases: Get on Board, getonbrd, empleo tech Colombia, trabajo remoto LatAm.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/getonbrd-search/cli/src/cli.ts *)
---

# Get on Board Search Skill

Tech and digital jobs from Latin America, filtered to Colombia plus remote roles open to it.

- Endpoint: https://www.getonbrd.com/api/v0/search/jobs (country_code=CO). robots.txt checked 2026-11-12 with `tools/robots_check.py`: allowed.
- No authentication, no API key, zero runtime dependencies — just `bun`.
- Matching is client-side: every word of `--query` must appear in title, company or description; title matches first.
- `--location` keeps offers someone in that place can take (remote-anywhere, LatAm, or that place). It is not a city filter.
- Many offers are in English and paid in USD.

## Commands

```bash
bun run .agents/skills/getonbrd-search/cli/src/cli.ts search -q "<cargo>" [-l "<ciudad>"] [--remote] [--jobage <days>] [--limit <n>] [--format json|table|plain]
```

Flags are never silently ignored: an unknown flag fails with `UNKNOWN_FLAG`.

## Output

`json` (default): `{ meta: { count, total }, results: [ { id, title, company, location, salary, date, dateText, url, description, employmentType, remote } ] }`.
Errors go to stderr as `{ "error", "code" }` with a non-zero exit.

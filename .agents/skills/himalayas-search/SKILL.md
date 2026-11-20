---
name: himalayas-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search Himalayas (himalayas.app) for
  remote jobs worldwide with salary and seniority data. Trigger phrases: Himalayas, himalayas.app, remote jobs, trabajo remoto internacional.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/himalayas-search/cli/src/cli.ts *)
---

# Himalayas Search Skill

Remote jobs worldwide with seniority, salary and time-zone data. Search is done server-side, 20 offers per call.

- Endpoint: https://himalayas.app/jobs/api/search. robots.txt checked 2026-11-12 with `tools/robots_check.py`: allowed.
- No authentication, no API key, zero runtime dependencies — just `bun`.
- Matching is client-side: every word of `--query` must appear in title, company or description; title matches first.
- `--location` keeps offers someone in that place can take (remote-anywhere, LatAm, or that place). It is not a city filter.
- Many offers are in English and paid in USD.

## Commands

```bash
bun run .agents/skills/himalayas-search/cli/src/cli.ts search -q "<cargo>" [-l "<ciudad>"] [--remote] [--jobage <days>] [--limit <n>] [--format json|table|plain]
```

Flags are never silently ignored: an unknown flag fails with `UNKNOWN_FLAG`.

## Output

`json` (default): `{ meta: { count, total }, results: [ { id, title, company, location, salary, date, dateText, url, description, employmentType, remote } ] }`.
Errors go to stderr as `{ "error", "code" }` with a non-zero exit.

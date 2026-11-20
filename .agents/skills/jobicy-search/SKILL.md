---
name: jobicy-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search Jobicy (jobicy.com) for
  remote jobs by region (Anywhere, LATAM, ...). Trigger phrases: Jobicy, jobicy.com, remote jobs, trabajo remoto.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/jobicy-search/cli/src/cli.ts *)
---

# Jobicy Search Skill

Remote jobs worldwide, with a geography field (Anywhere, LATAM, USA, ...). Jobicy's API terms ask for few, infrequent calls.

- Endpoint: https://jobicy.com/api/v2/remote-jobs. robots.txt checked 2026-11-12 with `tools/robots_check.py`: allowed.
- No authentication, no API key, zero runtime dependencies — just `bun`.
- Matching is client-side: every word of `--query` must appear in title, company or description; title matches first.
- `--location` keeps offers someone in that place can take (remote-anywhere, LatAm, or that place). It is not a city filter.
- Many offers are in English and paid in USD.

## Commands

```bash
bun run .agents/skills/jobicy-search/cli/src/cli.ts search -q "<cargo>" [-l "<ciudad>"] [--remote] [--jobage <days>] [--limit <n>] [--format json|table|plain]
```

Flags are never silently ignored: an unknown flag fails with `UNKNOWN_FLAG`.

## Output

`json` (default): `{ meta: { count, total }, results: [ { id, title, company, location, salary, date, dateText, url, description, employmentType, remote } ] }`.
Errors go to stderr as `{ "error", "code" }` with a non-zero exit.

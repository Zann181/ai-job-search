---
name: remoteok-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search Remote OK (remoteok.com) for
  remote jobs worldwide, mostly software, design and marketing. Trigger phrases: Remote OK, remoteok, trabajo remoto, remote jobs.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/remoteok-search/cli/src/cli.ts *)
---

# Remote OK Search Skill

Remote jobs worldwide (mostly tech). The site asks that you link back to the offer; the CLI keeps each offer's own URL.

- Endpoint: https://remoteok.com/api. robots.txt checked 2026-11-12 with `tools/robots_check.py`: allowed.
- No authentication, no API key, zero runtime dependencies — just `bun`.
- Matching is client-side: every word of `--query` must appear in title, company or description; title matches first.
- `--location` keeps offers someone in that place can take (remote-anywhere, LatAm, or that place). It is not a city filter.
- Many offers are in English and paid in USD.

## Commands

```bash
bun run .agents/skills/remoteok-search/cli/src/cli.ts search -q "<cargo>" [-l "<ciudad>"] [--remote] [--jobage <days>] [--limit <n>] [--format json|table|plain]
```

Flags are never silently ignored: an unknown flag fails with `UNKNOWN_FLAG`.

## Output

`json` (default): `{ meta: { count, total }, results: [ { id, title, company, location, salary, date, dateText, url, description, employmentType, remote } ] }`.
Errors go to stderr as `{ "error", "code" }` with a non-zero exit.

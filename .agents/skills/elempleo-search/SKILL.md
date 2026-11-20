---
name: elempleo-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Colombia on
  elempleo.com, find job listings in Bogotá, Medellín, Cali, Barranquilla or
  another Colombian city, or look up a specific elempleo.com posting. Trigger
  phrases: find a job in Colombia, job search Colombia, elempleo, vacancies in
  Bogotá, "are there any X jobs in Cali", buscar empleo, ofertas de empleo,
  vacantes, empleos en Medellín, trabajo en Colombia, ver esta oferta de elempleo.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/elempleo-search/cli/src/cli.ts *)
---

# elempleo.com Search Skill (Colombia)

Search live job listings on **elempleo.com** (Colombia), across all sectors. No
authentication, no API key, and **zero runtime dependencies** — it runs with just `bun`.

## ⚠️ Personal use only

elempleo.com's terms (quoted in its `robots.txt`) make its content available for
**personal, non-commercial use** and prohibit automated scraping or data mining without
prior written permission. This skill reads the same public pages a browser does, one page
per command — **keep volume very low, never use it commercially or for bulk data
collection, and run it on your own responsibility.** If you would rather not, set
`enabled: false` above and search elempleo.com by hand.

## When to use this skill

- Search for job openings in Colombia, optionally in one city
- Keep only recent postings (`--jobage`, filtered client-side)
- Get the full description, salary range and contract type of a specific posting

## Commands

### Search job listings

```bash
bun run .agents/skills/elempleo-search/cli/src/cli.ts search --query "<cargo>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Job title or skill, e.g. `"analista de datos"`.
- `--location <text>` / `-l <text>` — a city: `"Bogotá"`, `"Medellín"`, `"Cali"`, `"Barranquilla"`, ... (only the part before a comma is used, so `"Bogotá, D.C."` works). Omit for all of Colombia. An unrecognised city is an error (`LOCATION_NOT_FOUND`), never a silent nationwide search.
- `--jobage <days>` — posted within N days. Applied **client-side** to the current page from each card's relative age ("Ayer", "Hace 5 días", "Hace 2 semanas").
- `--page <n>` — page number (1-indexed, 20 results per page). A page past the end returns no results.
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/elempleo-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric offer id from `search` results (e.g. `1886774769`), or a full
`www.elempleo.com/co/ofertas-trabajo/...` URL. Returns the description, posting date,
expiry (`validThrough`), employment type, salary range, a `remote` flag, and `isActive`
(false once `validThrough` has passed).

## Usage examples

```bash
# Data analyst roles in Bogotá
bun run .agents/skills/elempleo-search/cli/src/cli.ts search -q "analista de datos" -l "Bogotá" --format table

# Full-stack developer roles in Medellín, last 14 days
bun run .agents/skills/elempleo-search/cli/src/cli.ts search -q "desarrollador full stack" -l "Medellín" --jobage 14 --format table

# Systems technician roles anywhere in Colombia, page 2
bun run .agents/skills/elempleo-search/cli/src/cli.ts search -q "técnico de sistemas" --page 2 --format table

# Electronics engineer roles in Cali
bun run .agents/skills/elempleo-search/cli/src/cli.ts search -q "ingeniero electrónico" -l "Cali" --format table

# Full description of one posting
bun run .agents/skills/elempleo-search/cli/src/cli.ts detail 1886774769 --format plain
```

## Output formats

| Format | Use |
|--------|-----|
| `json` | Default. `{ "meta": { "count", "page", "total" }, "results": [...] }`; each result has `id`, `title`, `company`, `location`, `salary`, `date`, `dateText`, `url`. |
| `table` | Quick human scan in the terminal. |
| `plain` | One block per job, readable in chat. |

## Notes

- Search is **path-based**: `/co/ofertas-empleo/[<city>/]trabajo-<query>[/<page>]`.
- elempleo answers an unknown query, unknown city, or a page past the end with an **unfiltered listing** (HTTP 200). The CLI reads the filters the page actually applied (`data-init-filters`) and returns no results / an error instead of passing those jobs off as matches.
- Multi-word queries are matched loosely by the portal (`desarrollador full stack` also returns generic developer roles) — check titles.
- `date` on search results is **approximate** (from "Hace N semanas"); `detail` returns the exact `datePosted`.
- `detail` titles come from the page's JSON-LD and are often all-lowercase.
- Some descriptions contain `?` where the employer used emoji — the portal itself serves them that way.
- The site's JSON search API needs authorization and is deliberately not used.
- See `url-reference.md` for endpoints and parsing anchors.

---
name: magneto-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Colombia on
  Magneto365 (magneto365.com), see the newest offers for a job title or in a
  Colombian city (Bogotá, Medellín, Cali, Barranquilla, ...), or look up a
  specific Magneto posting. Trigger phrases: find a job in Colombia, Magneto,
  Magneto365, vacancies in Medellín, buscar empleo, ofertas de empleo, vacantes,
  empleos en Bogotá, trabajo en Colombia, ver esta oferta de Magneto.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/magneto-search/cli/src/cli.ts *)
---

# Magneto365 Search Skill (Colombia) — limited coverage

Read the newest job offers on **Magneto365** (Colombia) for a job title or a city. No
authentication, no API key, and **zero runtime dependencies** — it runs with just `bun`.

## ⚠️ Limited by design, personal use only

Magneto's `robots.txt` disallows every URL with a query string (`Disallow: /*?`), which
includes its free-text search. This skill therefore reads only the server-rendered landing
pages robots.txt allows, and each shows just its **20 newest offers**:

- **Job-title pages** (`/co/trabajos/ofertas-empleo-de-<cargo>`) — used when your `--query`
  matches a title in Magneto's taxonomy (e.g. `desarrollador`, `auxiliar contable`).
- **City pages** (`/co/trabajos/ofertas-empleo-en-<ciudad>`) — used with `--location`.
- **General listing** (`/co/trabajos/buscar`) — otherwise.

When the query is not a taxonomy title, the city page or the general listing is read and
its 20 titles are filtered by your keywords — so a niche query often returns nothing even
when Magneto has matching jobs. There is **no paging and no posting-age filter**.
Use Computrabajo or elempleo for broad searches; treat Magneto as a supplement.
Keep volume low and run it on your own responsibility.

## Commands

### Search job listings

```bash
bun run .agents/skills/magneto-search/cli/src/cli.ts search [--query "<cargo>"] [--location "<ciudad>"] [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — job title / keywords.
- `--location <text>` / `-l <text>` — a city: `"Bogotá"`, `"Medellín"`, `"Cali"`, `"Barranquilla"`, `"Bucaramanga"`, ... An unknown city is an error (`LOCATION_NOT_FOUND`).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.
- `--page` (other than 1) and `--jobage` are **refused** with `PAGE_UNSUPPORTED` / `JOBAGE_UNSUPPORTED` rather than silently ignored.

### Fetch full job detail

```bash
bun run .agents/skills/magneto-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the offer **slug** from `search` results (e.g. `desarrollador-ecommerce-1114167`) —
Magneto resolves offers by the full slug, so the bare number does not work — or a full
`www.magneto365.com/co/empleos/...` URL. Returns the description, posting date, expiry,
employment type, salary, cities and `isActive`.

## Usage examples

```bash
# Newest developer offers nationwide (taxonomy title page)
bun run .agents/skills/magneto-search/cli/src/cli.ts search -q "desarrollador" --format table

# Accounting assistant offers in Medellín
bun run .agents/skills/magneto-search/cli/src/cli.ts search -q "auxiliar contable" -l "Medellín" --format table

# Newest offers in Bogotá, filtered to "soporte" in the title
bun run .agents/skills/magneto-search/cli/src/cli.ts search -q "soporte" -l "Bogotá" --format plain

# Full description of one posting
bun run .agents/skills/magneto-search/cli/src/cli.ts detail desarrollador-ecommerce-1114167 --format plain
```

## Output formats

| Format | Use |
|--------|-----|
| `json` | Default. `{ "meta": { "count", "page", "source", "cargo", "sourceUrl" }, "results": [...] }`; each result has `id`, `title`, `company`, `contractType`, `salary`, `location`, `date` (always `null` — use `detail`), `url`. `meta.source` is `cargo`, `city` or `all`. |
| `table` | Quick human scan in the terminal. |
| `plain` | One block per job, readable in chat. |

## Notes

- Unknown job-title, city or offer slugs return HTTP 500 from Magneto; the CLI reads that as "no such page".
- Job-title pages are matched loosely by Magneto itself (a `soporte` page can include IT preconfiguration roles) — check titles.
- Sector pages (`/co/trabajos/vacantes-en-...`) render only one card server-side and are not used.
- `paginator[page]` is allowed by robots.txt but ignored server-side (always the first 20).
- See `url-reference.md` for endpoints and parsing anchors.

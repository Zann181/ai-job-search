---
name: computrabajo-search
version: 1.0.0
description: >
  Use this skill when the user wants to search for jobs in Colombia on Computrabajo
  (co.computrabajo.com), the country's largest general job board, or look up a specific
  Computrabajo posting. Covers any city or department (Bogotá, Medellín, Pereira, Armenia, Cali,
  Barranquilla...) and remote offers. Trigger phrases: find a job in Colombia, Computrabajo,
  job search Colombia, buscar empleo, buscar trabajo, ofertas de trabajo, ofertas de empleo,
  vacantes, empleos en Bogotá, trabajo remoto Colombia, "hay vacantes de X en <ciudad>".
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/computrabajo-search/cli/src/cli.ts *)
---

# Computrabajo Search Skill (Colombia)

Search live job listings on **Computrabajo Colombia** (co.computrabajo.com). No authentication,
no API key, and **zero runtime dependencies**: it runs with just `bun`.

## ⚠️ Personal use only

This reads Computrabajo's public pages, only on paths its `robots.txt` allows. **Keep volume
low and don't use it commercially or for bulk data collection.** Run it on your own responsibility.

## When to use this skill

- Search Colombian job openings by title or skill, optionally in a city or department
- Filter by recency (client-side, see Notes)
- Get the full description, contract terms, and deadline of a specific posting

## Commands

```bash
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search -q "<query>" [flags]
bun run .agents/skills/computrabajo-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

### Search flags

| Flag | Description |
|------|-------------|
| `--query`, `-q` | Job title or skill. **Required.** e.g. `"desarrollador full stack"` |
| `--location`, `-l` | City or department, e.g. `"Pereira"`, `"Antioquia"`. Omit for all of Colombia |
| `--jobage <days>` | Posted within N days. Applied client-side to the fetched page |
| `--page <n>` | 1-indexed page, 20 results per page. Default 1 |
| `--limit`, `-n <n>` | Cap results emitted (client-side) |
| `--format` | `json` (default), `table`, `plain` |

There is no `--remote` flag: remote offers appear in every location's results with
`modality: "Remoto"` (or `"Presencial y remoto"` for hybrid). Filter on that field.

## Examples

```bash
# Full stack roles, all of Colombia
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search -q "desarrollador full stack" --format table

# Systems technician in Pereira, last 14 days
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search -q "tecnico en sistemas" -l "Pereira" --jobage 14 --format table

# Data analyst in Pereira, readable output
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search -q "analista de datos" -l "Pereira" --format plain

# IT support in Antioquia (department), second page
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search -q "soporte tecnico" -l "Antioquia" --page 2 --format table

# Full description of one offer
bun run .agents/skills/computrabajo-search/cli/src/cli.ts detail 2250A81C0E34DA2761373E686DCF3405 --format plain
```

## Output

| Format | Contents |
|--------|----------|
| `json` | `{ "meta": { "count", "page" }, "results": [ { id, title, company, location, date, dateText, modality, salary, url } ] }` |
| `table` | One line per result: id, title, company, location, modality, date |
| `plain` | Readable blocks with salary and URL |

`detail --format json` adds `description`, `employmentType`, `validThrough` (deadline) and
`tags` (salary, contract type, schedule, modality as shown on the page).

## Notes

- **Dates:** cards show relative dates ("Hace 3 horas", "Ayer", "Hace 5 días", "8 de octubre").
  `date` is the ISO date derived from them; `dateText` keeps the original wording. "Más de 30
  días" has `date: null`.
- **`--jobage` is client-side:** `robots.txt` disallows the portal's `pubdate=` filter, so the
  CLI filters the fetched page instead. A filtered page can return fewer than 20 results.
- **Loose matching:** when a query has few exact matches in a city, Computrabajo pads the page
  with unrelated offers from that city (e.g. "técnico en sistemas en Pereira" also returns
  mechanics and warehouse roles). Check titles before evaluating.
- **Location results include remote offers** from other cities.
- **Anonymous employers:** some offers hide the company and show a description such as
  "Compañía con presencia a nivel nacional" in its place.
- **Errors** go to stderr as `{ "error", "code" }` with exit code 1.

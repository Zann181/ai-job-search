---
name: serviciodeempleo-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Colombia on the
  Servicio Público de Empleo (buscadordeempleo.gov.co), the official government
  job aggregator that carries the SENA Agencia Pública de Empleo (APE) and the
  cajas de compensación familiar (Comfama, Colsubsidio, Cafam, Comfenalco, ...),
  or look up one of its postings by code. Trigger phrases: Servicio Público de
  Empleo, SPE, SENA, Agencia Pública de Empleo, buscador de empleo, bolsa de
  empleo del gobierno, vacantes Comfama, vacantes Colsubsidio, empleo público,
  buscar empleo en Colombia.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/serviciodeempleo-search/cli/src/cli.ts *)
---

# Servicio Público de Empleo Search Skill (Colombia)

Search live offers on the **Servicio Público de Empleo** (`buscadordeempleo.gov.co`), the
Colombian government's unified job search. It aggregates the SENA APE, the cajas de
compensación and private providers, ~250,000 offers. No authentication, no API key,
zero runtime dependencies — just `bun`.

## How it works

The site is a single-page app over a public JSON API (`/backbue/v1/vacantes/resultados`).
`buscadordeempleo.gov.co` publishes no `robots.txt` (404). The CLI makes a handful of
requests per search, newest offers first. Personal use only; keep volume low.

- `--query` is a **substring match** over the offer text (title, description, company).
  If the whole phrase appears nowhere, the longest word is searched and offers that
  contain every word are kept. Offers whose **title** matches are listed first.
- `--location` filters on the exact municipality when the city is known (Bogotá, Medellín,
  Cali, Barranquilla, ...); otherwise it is filtered client-side over three pages.
- Expired offers (past `FECHA_VENCIMIENTO`) are dropped.
- Search results already include the **full description** and the required experience, so
  `detail` is rarely needed.
- Many offers here are also published on Computrabajo, Magneto or elempleo: expect some
  duplicates across portals (the URLs differ).

## Commands

```bash
bun run .agents/skills/serviciodeempleo-search/cli/src/cli.ts search -q "<cargo>" [-l "<ciudad>"] [--remote] [--jobage <days>] [--page <n>] [--limit <n>] [--format json|table|plain]
bun run .agents/skills/serviciodeempleo-search/cli/src/cli.ts detail <codigo|url> [--format json|plain]
```

`codigo` is `<sede>-<proceso>` (e.g. `1626427399-24`); a `personas.serviciodeempleo.gov.co/detalle_oferta.aspx?sede_id=...&proceso_id=...` URL also works. Offers that
come from a partner board (Computrabajo, Magneto, ...) have that board's id and are not
fetchable by `detail`; their search result already holds the text.

Flags are never silently ignored: an unknown flag fails with `UNKNOWN_FLAG`.
`--page` is the API page (50 offers, newest first), not 20 as on other portals.

## Usage examples

```bash
bun run .agents/skills/serviciodeempleo-search/cli/src/cli.ts search -q "desarrollador" -l "Medellín" --jobage 14 --format table
bun run .agents/skills/serviciodeempleo-search/cli/src/cli.ts search -q "analista de datos" --remote --format plain
bun run .agents/skills/serviciodeempleo-search/cli/src/cli.ts detail 1626427399-24 --format plain
```

## Output

`json` (default): `{ meta: { count, page, pageSize, total }, results: [ { id, title, company, location, salary, date, dateText, url, description, employmentType, remote } ] }`.
Errors go to stderr as `{ "error", "code" }` with a non-zero exit.

## Not covered (checked 2026-11-12)

- **Talent.com**: its `robots.txt` disallows `/search-jobs/*` and the search API.
- **ape.sena.edu.co**: shows a security-incident notice; the same offers appear here.
- **IMEBU, Comfama**: regional; their offers are in this aggregator or on Magneto.
- **Match Pro**: a mobile app, no website. **Ferias de empleo**: temporary event pages.

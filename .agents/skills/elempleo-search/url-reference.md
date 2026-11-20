# elempleo.com (Colombia) — URL & parsing reference

Recorded 2026-10-28 against live pages. Update this file when the portal changes its markup.

## Access and terms

- `https://www.elempleo.com/robots.txt` (`User-agent: *`) does not disallow
  `/co/ofertas-empleo/...` or `/co/ofertas-trabajo/...`. It disallows `*?&trabajo=`,
  `/busqueda?`, `/colombia/JobOffers/` and account/admin paths. The CLI uses no query strings.
- The same file quotes the **terms**: content is for personal, non-commercial use, and
  automated scraping/data mining is prohibited without written permission. Hence the
  personal-use warning in `SKILL.md`.
- No login needed. The plain `Mozilla/5.0 (compatible; elempleo-cli/1.0)` UA gets HTTP 200.
- The JSON API behind the page (`POST /co/api/joboffers/findbyfilter`) returns
  **401 Authorization has been denied** without the site's client token — not used.

## Search

```
GET https://www.elempleo.com/co/ofertas-empleo/[<city-slug>/]trabajo-<query-slug>[/<page>]
```

| Part | Meaning |
|------|---------|
| `<query-slug>` | Lowercase, accents stripped, punctuation dropped, spaces → `-` |
| `<city-slug>` | Same rules on the city name only (`bogota`, `medellin`, `cali`, `barranquilla`); the site also has `bogota-alrededores` |
| `/<page>` | 1-indexed page, omitted for page 1. 20 results per page |

**Silent fallback:** an unknown query, an unknown city or a page past the end returns
HTTP 200 with an unfiltered listing. The page echoes the filters it applied in
`data-init-filters="{&quot;query&quot;:...,&quot;cities&quot;:[10],&quot;pageIndex&quot;:2,...}"`
(HTML-escaped JSON) — compare `query`, `cities` and `pageIndex` with the request.
Total matches: `data-results-joboffers="467"`.

### Result cards

Each result: `<div class="col-md-12 p-0 js-area-bind area-bind" data-url="/co/ofertas-trabajo/<slug>-<id>" data-ga4-offerdata="{...}">`.

| Field | Anchor |
|-------|--------|
| id, title, company, location, salary | HTML-escaped JSON in `data-ga4-offerdata` (`id` number, `title`, `company` with trailing space, `location` city, `salary` e.g. `$3 a $3,5 millones`); real results have `"list_id":"resultado_ofertas"` |
| url | `data-url` on the same div |
| date | `<span class="... js-offer-date ..."><i class="fa fa-clock-o ..."></i> Hace 3 semanas</span>` — `Ayer`, `Hace N días`, `Hace N semanas`, `Hace N mes(es)` |

The page also ships Handlebars templates (`<script type="text/x-handlebars-template">`)
containing `data-ga4-offerdata="{{...}}"` — not JSON, skipped.

## Detail

```
GET https://www.elempleo.com/co/ofertas-trabajo/<anything>-<id>
```

The slug is cosmetic (the CLI uses `oferta-<id>`); `<link rel="canonical">` gives the real URL.
A removed/unknown id returns **HTTP 410 Gone**.

JSON-LD `<script type="application/ld+json">` with `"@type": "JobPosting"`: `title`
(often lowercase), `description` (plain text, `\r\n`), `datePosted` (unpadded, `2026-9-30`),
`validThrough`, `employmentType`, `hiringOrganization.name`, `jobLocationType`
(`TELECOMMUTE` = remote), `baseSalary.value.{minValue,maxValue}` in COP.
The JSON-LD has no city; the page shows it in `<span class="js-joboffer-city"> Remoto </span>`
followed by `<span class="d-block ... info-label">Ubicación</span>`.

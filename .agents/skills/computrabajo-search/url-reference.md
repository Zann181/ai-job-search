# Computrabajo Colombia - URL Reference

Investigated 2026-10-27 against live pages. Update the anchors here when the markup changes.

## robots.txt (co.computrabajo.com/robots.txt)

Allowed: `/trabajo-de-*` search paths, `?p=<n>` pagination, `/ofertas-de-trabajo/<slug>-<ID>` detail pages.

Disallowed (never send): `/ofertas-de-trabajo/*` with `dis=`, `cont=`, `pubdate=`, `sal=`, `by=`,
`emp=` and their `em*` variants; `/hojas-de-vida/*`, `/curriculums/*`, `/Ajax/*`, `/_services/*`,
`/go/*`, `/ofertas-de-trabajo/Detail/Print.aspx`.

## Search

```
https://co.computrabajo.com/trabajo-de-<query-slug>[-en-<location-slug>][?p=<page>]
```

| Part | Notes |
|------|-------|
| `<query-slug>` | Query lowercased, accents stripped, non-alphanumerics to `-` (`Técnico en Sistemas` -> `tecnico-en-sistemas`) |
| `-en-<location-slug>` | City or department, same slug rules (`medellin`, `risaralda`, `bogota-dc`) |
| `p` | 1-indexed page; omitted for page 1. 20 cards per page |

No JSON API is used: search data comes from the server-rendered HTML.

### Result card anchors

Each result is `<article class="box_offer ..." data-id='<ID>' ...>` ... `</article>`.

| Field | Anchor |
|-------|--------|
| id | `data-id='<32 hex chars>'` on the `<article>` |
| title + url | `<a class="js-o-link fc_base" href="/ofertas-de-trabajo/...-<ID>#lc=...">Title</a>` inside `<h2>` (strip `#lc=`) |
| company | `<p class="dFlex vm_fx fs16 fc_base mt5">`; usually an `<a offer-grid-article-company-url>`, plain text for anonymous employers. May start with a rating badge `<span class="fx_none mr10"><span class="fwB">4,5</span><span class="star"></span></span>` (removed) |
| location | `<p class="fs16 fc_base mt5"><span class="mr10">City, Department</span>` |
| modality | `<span class="icon i_home"></span>Remoto` or `i_home_office` (Presencial y remoto) inside `<div class="fs13 mt15">` |
| salary | `<span class="icon i_salary"></span>$ 2.530.000,00 (Mensual)` in the same div, when shown |
| date | `<p class="fs13 fc_aux mt15">Hace 5 días</p>` (relative; see SKILL.md Notes) |

## Detail

```
https://co.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-x-<ID>
```

The slug before the ID is ignored by the server, so the CLI uses a fixed `x` slug.

| Field | Source |
|-------|--------|
| title | `<h1 class="fwB fs24 ...">` (JSON-LD `title` as fallback) |
| company, location | JSON-LD `hiringOrganization.name`, `jobLocation.address.addressLocality/addressRegion` |
| datePosted, validThrough, employmentType, url | JSON-LD `JobPosting` node inside the `@graph` of a `<script type="application/ld+json">` |
| tags | `<span class="tag base mb10">` items in the `<div class="mbB">` right after `Descripción de la oferta</h2>` (salary, contract, schedule, modality) |
| description | First `<p class="mbB">` after that heading; newlines in the source are line breaks |

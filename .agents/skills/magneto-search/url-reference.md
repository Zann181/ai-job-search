# Magneto365 (Colombia) — URL & parsing reference

Recorded 2026-10-28 against live pages. Update this file when the portal changes its markup.

## Access

- `https://www.magneto365.com/robots.txt` (`User-agent: *`): `Allow: /`,
  **`Disallow: /*?`** (every URL with a query string), `Allow: /*paginator[page]`,
  `Disallow: /manager/*`. Free-text search (`/co/trabajos/buscar?q=...`) is therefore off limits.
- No login needed. The plain `Mozilla/5.0 (compatible; magneto-cli/1.0)` UA gets HTTP 200.
- Unknown landing-page or offer slugs return **HTTP 500** (not 404).

## Landing pages (search)

| Page | URL | Notes |
|------|-----|-------|
| Job title | `/co/trabajos/ofertas-empleo-de-<cargo-slug>` | ~2300 listed at `/co/trabajos/empleos-por-cargo`; more slugs work than are listed (e.g. `desarrollador`) |
| City | `/co/trabajos/ofertas-empleo-en-<city-slug>` | `bogota`, `medellin`, `cali`, `barranquilla`, `bucaramanga`, ...; index at `/co/trabajos/empleos-por-ciudades` |
| All | `/co/trabajos/buscar` | newest offers nationwide |
| Sector | `/co/trabajos/vacantes-en-<slug>` | renders only 1 card server-side — **not used** |

Each page server-renders 20 cards. `?paginator[page]=N` is allowed by robots but returns the
same first 20 (paging happens client-side). The pages also carry a JSON-LD `ItemList` with the
20 offer URLs.

### Result cards

```html
<article ... class="mg_job_card_desktop_magneto-ui-card-jobs_1m137 ">
  ... <span class="..._published_1m137"><template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template></span>
  <h2 ...><a href="https://www.magneto365.com/co/empleos/<slug>-<number>" ...>Title</a></h2>
  <h3 ...>Company | Contract type</h3>
  <p ...>$ 3.000.000 a $ 4.500.000, </p>
  <p ...>Medellín - Bogotá, D.C. - Barranquilla</p>
</article>
```

The `_1m137` suffix is a build hash — match on `magneto-ui-card-jobs`. The publish date is
rendered client-side (empty server-side). Some cards appear twice; dedupe by slug.

## Detail

```
GET https://www.magneto365.com/co/empleos/<slug>-<number>
```

The **full slug** is required (`/co/empleos/x-1114167` → 500). JSON-LD
`<script id="JobPosting" type="application/ld+json">`: `title`, `datePosted`, `validThrough`,
`description` (flattened text, `&nbsp;`), `employmentType`, `hiringOrganization.name`,
`jobLocation.address.addressLocality` (**array** of cities), `baseSalary.value.{minValue,maxValue}`
(`maxValue: 0` = single value), plus `skills`, `qualifications`, `industry`, `occupationalCategory`.

import { describe, expect, test } from "bun:test"
import {
  ageInDays,
  citySlug,
  padDate,
  parseAppliedFilters,
  parseJobCards,
  parseJobDetail,
} from "../src/helpers.ts"
import { buildUrl } from "../src/commands/search.ts"
import { normalizeId } from "../src/commands/detail.ts"

const NOW = new Date("2026-10-28T12:00:00Z")

const ga4 = (o: Record<string, unknown>) => JSON.stringify(o).replace(/"/g, "&quot;")

// Trimmed from a live search page (2026-10-28), structure unchanged.
const SEARCH_HTML = `
<div data-webapi-search="/co/api/joboffers/findbyfilter"
     data-init-filters="${ga4({ query: "analista de datos", cities: [10], pageIndex: 2, pageSize: 20 })}"
     data-results-joboffers="467"></div>
<div class="col-md-12 result-item mb-3 bg-white" style="text-align: left;">
  <div class="col-md-12 p-0 js-area-bind area-bind" data-url="/co/ofertas-trabajo/analista-de-datos-1886774769" data-ga4-offerdata="${ga4({ section: "SEARCH", id: 1886774769, title: "Analista de datos", company: "ATCG DE COLOMBIA S.A.S ", location: "Bogot&#225;", salary: "$3 a $3,5 millones", list_id: "resultado_ofertas" })}" style="position: relative;">
    <h2><a class="js-offer-title" href="/co/ofertas-trabajo/analista-de-datos-1886774769">Analista de datos</a></h2>
    <span class="rounded-pill px-3 info-publish-date pull-right js-offer-date mi-etiqueta">
      <i class="fa fa-clock-o icon" aria-hidden="true"></i>
      Hace 3 semanas
    </span>
  </div>
</div>
<div class="col-md-12 result-item mb-3 bg-white">
  <div class="col-md-12 p-0 js-area-bind area-bind" data-url="/co/ofertas-trabajo/data-analyst-1886777221" data-ga4-offerdata="${ga4({ id: 1886777221, title: "Data​ analyst", company: "", location: "Medell&#237;n", salary: "", list_id: "resultado_ofertas" })}">
    <span class="js-offer-date"><i class="fa"></i> Hace 5 d&#237;as</span>
  </div>
</div>
<div class="col-md-12 result-item"><div class="js-area-bind" data-url="/co/ofertas-trabajo/dup-1886777221" data-ga4-offerdata="${ga4({ id: 1886777221, title: "Duplicate", list_id: "resultado_ofertas" })}"></div></div>
<script id="hbtpl" type="text/x-handlebars-template">
  <div class="js-area-bind" data-url="{{url}}" data-ga4-offerdata="{{{ga4OfferData}}}"></div>
</script>
`

describe("parseJobCards", () => {
  const cards = parseJobCards(SEARCH_HTML, NOW)

  test("parses real cards, skips templates and duplicates", () => {
    expect(cards.map((c) => c.id)).toEqual(["1886774769", "1886777221"])
  })

  test("extracts fields", () => {
    expect(cards[0]).toEqual({
      id: "1886774769",
      title: "Analista de datos",
      company: "ATCG DE COLOMBIA S.A.S",
      location: "Bogotá",
      salary: "$3 a $3,5 millones",
      date: "2026-10-07",
      dateText: "Hace 3 semanas",
      url: "https://www.elempleo.com/co/ofertas-trabajo/analista-de-datos-1886774769",
    })
  })

  test("empty strings become null, invisible chars stay for stripInvisible", () => {
    expect(cards[1].company).toBeNull()
    expect(cards[1].salary).toBeNull()
    expect(cards[1].dateText).toBe("Hace 5 días")
  })
})

describe("helpers", () => {
  test("parseAppliedFilters", () => {
    expect(parseAppliedFilters(SEARCH_HTML)).toEqual({ query: "analista de datos", cities: [10], pageIndex: 2, total: 467 })
    expect(parseAppliedFilters("<html></html>")).toBeNull()
  })

  test("citySlug keeps the part before the comma", () => {
    expect(citySlug("Bogotá, D.C.")).toBe("bogota")
    expect(citySlug("Medellín, Antioquia")).toBe("medellin")
  })

  test("buildUrl", () => {
    expect(buildUrl({ query: "analista de datos", location: "Medellín", page: 2 })).toBe(
      "https://www.elempleo.com/co/ofertas-empleo/medellin/trabajo-analista-de-datos/2",
    )
    expect(buildUrl({ query: "Técnico de sistemas", page: 1 })).toBe(
      "https://www.elempleo.com/co/ofertas-empleo/trabajo-tecnico-de-sistemas",
    )
  })

  test("ageInDays", () => {
    expect(ageInDays("Hoy")).toBe(0)
    expect(ageInDays("Ayer")).toBe(1)
    expect(ageInDays("Hace 5 días")).toBe(5)
    expect(ageInDays("Hace 2 semanas")).toBe(14)
    expect(ageInDays("Hace 1 mes")).toBe(30)
    expect(ageInDays("{{publishDateInfo}}")).toBeNull()
  })

  test("padDate", () => {
    expect(padDate("2026-9-3")).toBe("2026-09-03")
    expect(padDate(undefined)).toBeNull()
  })

  test("normalizeId accepts ids and elempleo URLs only", () => {
    expect(normalizeId("1886774769")).toBe("1886774769")
    expect(normalizeId("https://www.elempleo.com/co/ofertas-trabajo/analista-de-datos-1886774769")).toBe("1886774769")
    expect(normalizeId("https://www.elempleo.com.evil.io/co/ofertas-trabajo/x-1886774769")).toBeNull()
    expect(normalizeId("https://evil.io/co/ofertas-trabajo/x-1886774769")).toBeNull()
    expect(normalizeId("123")).toBeNull()
  })
})

describe("parseJobDetail", () => {
  const ld = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: "analista de datos",
    description: "Línea uno\r\n\r\nLínea dos<span hidden>oculto</span>",
    datePosted: "2026-9-30",
    validThrough: "2026-11-29",
    employmentType: "PER_DIEM",
    hiringOrganization: { "@type": "Organization", name: "ATCG DE COLOMBIA S.A.S " },
    jobLocationType: "TELECOMMUTE",
    baseSalary: { currency: "COP", value: { minValue: 3000001, maxValue: 3500000 } },
  }
  const html = `<link rel="canonical" href="https://www.elempleo.com/co/ofertas-trabajo/analista-de-datos-1886774769" />
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<span class="js-joboffer-city"> Remoto </span> <span class="d-block ts-8">Ubicación</span>`

  test("reads the JSON-LD JobPosting and page city", () => {
    const job = parseJobDetail(html, "1886774769", NOW)!
    expect(job.title).toBe("analista de datos")
    expect(job.company).toBe("ATCG DE COLOMBIA S.A.S")
    expect(job.location).toBe("Remoto")
    expect(job.remote).toBe(true)
    expect(job.date).toBe("2026-09-30")
    expect(job.description).toBe("Línea uno\n\nLínea dos")
    expect(job.url).toBe("https://www.elempleo.com/co/ofertas-trabajo/analista-de-datos-1886774769")
    expect(job.isActive).toBe(true)
  })

  test("past validThrough is closed", () => {
    expect(parseJobDetail(html, "1886774769", new Date("2027-01-01"))!.isActive).toBe(false)
  })

  test("page without a JobPosting is null", () => {
    expect(parseJobDetail("<html></html>", "1886774769", NOW)).toBeNull()
  })
})

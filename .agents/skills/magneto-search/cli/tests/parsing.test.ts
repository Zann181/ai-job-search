import { describe, expect, test } from "bun:test"
import {
  locationMatches,
  matchCargo,
  parseCargoIndex,
  parseJobCards,
  parseJobDetail,
  titleMatches,
  tokens,
} from "../src/helpers.ts"
import { planSearch } from "../src/commands/search.ts"
import { normalizeId } from "../src/commands/detail.ts"

const NOW = new Date("2026-10-28T12:00:00Z")

const card = (slug: string, title: string, company: string, salary: string, location: string) =>
  `<div class="mg_job_card_desktop_magneto-ui-card-jobs_container_1m137 "><article tabindex="0" role="button" aria-label="${title}" class="mg_job_card_desktop_magneto-ui-card-jobs_1m137 "><div class="mg_job_card_desktop_magneto-ui-card-jobs_data_1m137"><section class="mg_job_card_desktop_magneto-ui-card-jobs_header_1m137"><span class="mg_job_card_desktop_magneto-ui-card-jobs_published_1m137"><!--$!--><template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template><!--/$--></span></section><h2 class="mg_job_card_desktop_magneto-ui-card-jobs_text_1m137"><a href="https://www.magneto365.com/co/empleos/${slug}" title="${title}" target="_blank" class="mg_job_card_desktop_magneto-ui-card-jobs_a_1m137">${title}</a></h2><h3 class="mg_job_card_desktop_magneto-ui-card-jobs_text_1m137 ">${company}</h3><p class="mg_job_card_desktop_magneto-ui-card-jobs_text_1m137 ">${salary}</p><p class="mg_job_card_desktop_magneto-ui-card-jobs_text_1m137 ">${location}</p></div></article></div>`

// Card markup trimmed from a live listing page (2026-10-28).
const LIST_HTML =
  card("desarrollador-ecommerce-1114167", "Desarrollador Ecommerce", "Prebel | Término indefinido", "$ 5.751.502, ", "Medellín") +
  card(
    "desarrollador-cobol-mainframe-altamira-host-y-db2-1111607",
    "Desarrollador Cobol Mainframe - Altamira, Host y DB2",
    "ACCENTURE LTDA | Término indefinido",
    "Salario a convenir, ",
    "Medellín - Bogotá, D.C. - Barranquilla",
  ) +
  card("desarrollador-ecommerce-1114167", "Desarrollador Ecommerce", "Prebel", "", "Medellín") +
  `<article class="mg_job_card_desktop_magneto-ui-card-jobs_1m137"><h2>no link</h2></article>`

describe("parseJobCards", () => {
  const cards = parseJobCards(LIST_HTML)

  test("parses each card once and skips the broken one", () => {
    expect(cards.map((c) => c.id)).toEqual([
      "desarrollador-ecommerce-1114167",
      "desarrollador-cobol-mainframe-altamira-host-y-db2-1111607",
    ])
  })

  test("extracts fields", () => {
    expect(cards[0]).toEqual({
      id: "desarrollador-ecommerce-1114167",
      title: "Desarrollador Ecommerce",
      company: "Prebel",
      contractType: "Término indefinido",
      salary: "$ 5.751.502",
      location: "Medellín",
      date: null,
      url: "https://www.magneto365.com/co/empleos/desarrollador-ecommerce-1114167",
    })
  })
})

describe("matching", () => {
  const index = parseCargoIndex(
    `<a href="https://www.magneto365.com/co/trabajos/ofertas-empleo-de-auxiliar-contable">x</a>
     <a href="https://www.magneto365.com/co/trabajos/ofertas-empleo-de-auxiliar-contable-tesoreria">x</a>
     <a href="https://www.magneto365.com/co/trabajos/ofertas-empleo-de-tecnico-servicio-ayuda-internet">x</a>`,
  )

  test("parseCargoIndex", () => {
    expect(index).toEqual(["auxiliar-contable", "auxiliar-contable-tesoreria", "tecnico-servicio-ayuda-internet"])
  })

  test("matchCargo prefers exact, then shortest containing all tokens", () => {
    expect(matchCargo("Auxiliar Contable", index)).toBe("auxiliar-contable")
    expect(matchCargo("contable tesorería", index)).toBe("auxiliar-contable-tesoreria")
    expect(matchCargo("técnico de internet", index)).toBe("tecnico-servicio-ayuda-internet")
    expect(matchCargo("analista de datos", index)).toBeNull()
  })

  test("tokens drop stopwords and accents", () => {
    expect(tokens("Técnico de Sistemas")).toEqual(["tecnico", "sistemas"])
  })

  test("titleMatches / locationMatches", () => {
    expect(titleMatches("Analista de Datos Senior", "analista datos")).toBe(true)
    expect(titleMatches("Analista Contable", "analista de datos")).toBe(false)
    expect(locationMatches("Medellín - Bogotá, D.C. - Barranquilla", "Bogotá, D.C.")).toBe(true)
    expect(locationMatches("Cali", "Bogotá")).toBe(false)
    expect(locationMatches(null, "Cali")).toBe(false)
  })

  test("planSearch", () => {
    expect(planSearch({ query: "auxiliar contable", location: "Cali", format: "json" }, index)).toMatchObject({
      source: "cargo",
      filterTitle: false,
      filterLocation: true,
    })
    expect(planSearch({ query: "analista de datos", location: "Medellín", format: "json" }, index)).toEqual({
      url: "https://www.magneto365.com/co/trabajos/ofertas-empleo-en-medellin",
      source: "city",
      cargo: null,
      filterTitle: true,
      filterLocation: false,
    })
    expect(planSearch({ query: "analista de datos", format: "json" }, index).url).toBe(
      "https://www.magneto365.com/co/trabajos/buscar",
    )
  })

  test("normalizeId needs the full slug or a magneto365 URL", () => {
    expect(normalizeId("desarrollador-ecommerce-1114167")).toBe("desarrollador-ecommerce-1114167")
    expect(normalizeId("https://www.magneto365.com/co/empleos/desarrollador-ecommerce-1114167")).toBe(
      "desarrollador-ecommerce-1114167",
    )
    expect(normalizeId("https://www.magneto365.com.evil.io/co/empleos/x-1114167")).toBeNull()
    expect(normalizeId("1114167")).toBeNull()
  })
})

describe("parseJobDetail", () => {
  const ld = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Desarrollador Ecommerce",
    datePosted: "2026-10-26",
    validThrough: "2026-11-28",
    description: " Desarrollador Ecommerce&nbsp; Buscamos<!-- x --> talento ",
    employmentType: "FULL_TIME",
    hiringOrganization: { "@type": "Organization", name: "Prebel" },
    jobLocation: { "@type": "Place", address: { addressLocality: ["Medellín", "Envigado"], addressRegion: ["Antioquia"] } },
    baseSalary: { currency: "COP", value: { minValue: 5751502, maxValue: 0 } },
  }
  const html = `<script id="JobPosting" type="application/ld+json" strategy="afterInteractive">${JSON.stringify(ld)}</script>`

  test("reads the JSON-LD JobPosting", () => {
    const job = parseJobDetail(html, "desarrollador-ecommerce-1114167", NOW)!
    expect(job.company).toBe("Prebel")
    expect(job.location).toBe("Medellín - Envigado")
    expect(job.date).toBe("2026-10-26")
    expect(job.description).toBe("Desarrollador Ecommerce Buscamos talento")
    expect(job.isActive).toBe(true)
  })

  test("page without a JobPosting is null", () => {
    expect(parseJobDetail("<html></html>", "x-1", NOW)).toBeNull()
  })
})

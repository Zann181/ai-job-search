import { describe, expect, test } from "bun:test"
import { promptFor } from "../src/application/prompts"
import type { Job } from "../src/domain/job"

const job = {
  key: "acme_analista", title: "Analista de datos", company: "Acme", location: "Bogotá",
  url: "https://example.com/oferta/1", portal: "elempleo-search", profile: "Analista de Datos Junior",
  description: "Requisitos:\n- SQL", strengths: [], gaps: [],
  application: { status: null, cv_tex: null, cover_tex: null, cv_pdf: null, cover_pdf: null },
} as unknown as Job

describe("CV generation from a template", () => {
  const adapt = { offerFile: "job_scraper/ofertas/acme_analista.txt", templateId: "analista_datos", templateRole: "Analista de Datos Junior", templates: ["analista_datos", "full_stack"] }

  test("runs /adaptar-plantilla on the Buscador's template with the saved description", () => {
    const p = promptFor("apply", ".", job, [], adapt)
    expect(p.startsWith("/adaptar-plantilla --plantilla analista_datos https://example.com/oferta/1")).toBe(true)
    expect(p).toContain("posting_guard.py --text --json --in job_scraper/ofertas/acme_analista.txt")
    expect(p).toContain("\\anexosfalse")
    expect(p).toContain("No envíes ninguna postulación")
  })

  test("lets the skill choose when no template matches, and fetches when there is no description", () => {
    const p = promptFor("apply", ".", job, [], { ...adapt, templateId: null, templateRole: null, offerFile: null })
    expect(p.startsWith("/adaptar-plantilla https://example.com/oferta/1")).toBe(true)
    expect(p).toContain("posting-fetcher")
    expect(p).toContain("analista_datos, full_stack")
  })

  test("Chrome fills and uploads but leaves the final submit to the candidate", () => {
    const p = promptFor("chrome", ".", { ...job, application: { ...job.application, cv_pdf: "cv/main_acme.pdf" } } as Job, [])
    expect(p).toContain("NO hagas clic en el botón final de envío")
    expect(p).toContain("upload_file")
    expect(p).toContain('"postulacion": "lista" | "no_lista"')
    expect(p).not.toContain("autorizó")
  })

  test("keeps the plain /apply flow without templates", () => {
    expect(promptFor("apply", ".", job, [], null).startsWith("/apply https://example.com/oferta/1")).toBe(true)
  })
})

import { normalizeProfile } from "../src/domain/candidate"
describe("prompts read the candidate profile", () => {
  const profile = normalizeProfile({ nombre: "Ana", nombre_completo: "Ana Prueba", deal_breakers: ["exige turnos nocturnos", "exige vehículo propio"] })
  const chromeJob = { ...job, application: { ...job.application, cv_pdf: "cv/main_acme.pdf" } } as Job

  test("uses the profile name and lists its deal-breakers in the Chrome run", () => {
    const p = promptFor("chrome", ".", chromeJob, [], null, profile)
    expect(p).toContain("Usa el navegador Brave de Ana")
    expect(p).toContain("deal-breaker de Ana (exige turnos nocturnos; exige vehículo propio)")
    expect(p).toContain("Candidato: Ana Prueba (perfil en CLAUDE.md)")
  })

  test("falls back to neutral wording without a profile", () => {
    const p = promptFor("chrome", ".", chromeJob, [])
    expect(p).toContain("Usa el navegador Brave del candidato")
    expect(p).toContain("Ese clic lo hace el candidato")
    expect(p).toContain("deal-breaker de CLAUDE.md")
    expect(p).toContain("Candidato: ver el perfil en CLAUDE.md")
  })

  test("the template flow names the candidate too", () => {
    const adapt = { offerFile: null, templateId: null, templateRole: null, templates: ["analista_datos"] }
    expect(promptFor("apply", ".", job, [], adapt, profile)).toContain("Ana pidió desde el dashboard")
    expect(promptFor("apply", ".", job, [], adapt)).toContain("El candidato pidió desde el dashboard")
  })
})

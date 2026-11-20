import { describe, expect, test } from "bun:test"
import { withinLimit } from "../src/domain/document"
import { buildJob, canApplyWithChrome, type ApplicationRecord, type Posting } from "../src/domain/job"
import { TASK_DEFINITIONS, modelFor } from "../src/domain/task"
import { anexosOn, checkTex, idFromName } from "../src/infrastructure/templates"

const posting: Posting = {
  key: "acme_dev", title: "Dev", company: "Acme", location: null, url: "https://x", portal: "computrabajo-search",
  posted_date: null, deadline: null, scrape_status: "ranked", rank_score: 70, rank_verdict: "Good Fit",
  location_verdict: "PASS", language_gate: "PASS", language_note: null, strengths: [], gaps: [],
}
const noApp: ApplicationRecord = { status: null, cv_tex: null, cover_tex: null, cv_pdf: null, cover_pdf: null }

describe("stage", () => {
  test("follows the funnel", () => {
    expect(buildJob(posting, {}, noApp).stage).toBe("puntuada")
    expect(buildJob(posting, { selected: true }, noApp).stage).toBe("seleccionada")
    expect(buildJob(posting, {}, { ...noApp, cv_pdf: "cv/a.pdf" }).stage).toBe("cv")
    expect(buildJob(posting, { cv_confirmed: true }, { ...noApp, cv_pdf: "cv/a.pdf" }).stage).toBe("confirmada")
    expect(buildJob(posting, {}, { ...noApp, status: "applied" }).stage).toBe("aplicada")
    expect(buildJob(posting, {}, { ...noApp, status: "rejected" }).stage).toBe("cerrada")
  })
})

describe("chrome gate", () => {
  test("needs a confirmed CV", () => {
    expect(canApplyWithChrome(buildJob(posting, {}, noApp))).not.toBeNull()
    expect(canApplyWithChrome(buildJob(posting, {}, { ...noApp, cv_pdf: "cv/a.pdf" }))).not.toBeNull()
    expect(canApplyWithChrome(buildJob(posting, { cv_confirmed: true }, { ...noApp, cv_pdf: "cv/a.pdf" }))).toBeNull()
  })
})

describe("model policy", () => {
  test("never routes to opus", () => {
    for (const d of Object.values(TASK_DEFINITIONS)) expect(["haiku", "sonnet"]).toContain(modelFor(d))
    expect(modelFor(TASK_DEFINITIONS.scrape)).toBe("haiku")
    expect(modelFor(TASK_DEFINITIONS.apply)).toBe("sonnet")
  })
})

describe("page limit", () => {
  test("is exact, never under or over", () => {
    expect(withinLimit({ pages: 1, pageLimit: 1 })).toBe(true)
    expect(withinLimit({ pages: 2, pageLimit: 1 })).toBe(false)
    expect(withinLimit({ pages: 1, pageLimit: 2 })).toBe(false)
    expect(withinLimit({ pages: null, pageLimit: 1 })).toBe(false)
  })
})

import { topSalary } from "../web/salary"
describe("salary floor", () => {
  test("reads COP amounts", () => {
    expect(topSalary("$ 1.423.500,00 (Mensual)")).toBe(1423500)
    expect(topSalary("Entre 1,8 y 2,5 millones")).toBe(2500000)
    expect(topSalary("A convenir")).toBeNull()
    expect(topSalary(null)).toBeNull()
  })
})

import { parseApplyOutcome, questionKey } from "../src/domain/answer"
describe("answer memory", () => {
  test("same question, different spelling", () => {
    expect(questionKey("¿Tiene MOTO propia?")).toBe(questionKey("tiene moto propia"))
  })
  test("reads the Chrome run outcome", () => {
    const r = parseApplyOutcome('Resumen...\n{"postulacion": "no_lista", "motivo": "falta salario", "preguntas_nuevas": ["¿Pretensión salarial?", ""]}')
    expect(r).toEqual({ sent: false, ready: false, cvUploaded: false, reason: "falta salario", newQuestions: ["¿Pretensión salarial?"] })
    const ready = parseApplyOutcome('{"postulacion": "lista", "cv_subido": true, "motivo": "", "preguntas_nuevas": []}')
    expect(ready).toMatchObject({ sent: false, ready: true, cvUploaded: true })
    expect(parseApplyOutcome('{"postulacion": "enviada", "motivo": "ok"}')?.sent).toBe(true)
    expect(parseApplyOutcome("sin json")).toBeNull()
  })
})

import { summaryOf } from "../src/domain/answer"
describe("history summary", () => {
  test("drops the machine-readable line", () => {
    expect(summaryOf('Hecho.\n{"postulacion": "no_enviada", "motivo": "x"}')).toBe("Hecho.")
  })
})

describe("plantillas: interruptor de anexos", () => {
  test("apagado en las plantillas tal como vienen", () => {
    expect(anexosOn(String.raw`\newif\ifanexos     \anexosfalse
\ifanexos
\includepdf{x.pdf}
\fi`)).toBe(false)
  })
  test("encendido fuera de un comentario se detecta", () => {
    expect(anexosOn(String.raw`\newif\ifanexos     \anexostrue`)).toBe(true)
    expect(anexosOn(String.raw`\anexostrue % ojo`)).toBe(true)
  })
  test("dentro de un comentario no cuenta", () => {
    expect(anexosOn(String.raw`% \anexostrue cuando el certificado esté corregido`)).toBe(false)
  })
})

describe("plantillas: importar .tex", () => {
  test("el id sale del nombre del archivo, sin tildes ni prefijo", () => {
    expect(idFromName("hoja_de_vida_analista_datos.tex")).toBe("analista_datos")
    expect(idFromName("Hoja de Vida - Técnico Electrónico.TEX")).toBe("tecnico_electronico")
  })
  test("rechaza lo que no es un documento LaTeX", () => {
    expect(() => checkTex("hola")).toThrow()
  })
  test("rechaza un documento con los anexos activos", () => {
    expect(() => checkTex(String.raw`\documentclass{article}
\anexostrue
\begin{document}x\end{document}`)).toThrow()
  })
  test("acepta un documento completo con anexos apagados", () => {
    expect(() => checkTex(String.raw`\documentclass{article}
\anexosfalse
\begin{document}x\end{document}`)).not.toThrow()
  })
})

import { belowFloor, formatCop } from "../web/salary"
describe("salary floor from the profile", () => {
  test("flags only a known salary under a known floor", () => {
    expect(belowFloor("$ 1.423.500,00 (Mensual)", 1_500_000)).toBe(true)
    expect(belowFloor("Entre 1,8 y 2,5 millones", 1_500_000)).toBe(false)
    expect(belowFloor("A convenir", 1_500_000)).toBe(false)
    expect(belowFloor("$ 900.000", null)).toBe(false)
    expect(belowFloor("$ 900.000", 0)).toBe(false)
  })
  test("formats COP with dot thousands", () => {
    expect(formatCop(1_500_000)).toBe("$1.500.000")
    expect(formatCop(950)).toBe("$950")
  })
})

import { candidateNames, normalizeProfile } from "../src/domain/candidate"
import { seedAnswers } from "../src/domain/answer"
describe("candidate profile", () => {
  test("fills every field with safe defaults", () => {
    for (const raw of [null, 42, "x", [], {}]) {
      expect(normalizeProfile(raw)).toEqual({ nombre: "", nombre_completo: "", ciudad: "", salario_minimo_mensual: null, deal_breakers: [], respuestas_semilla: [] })
    }
  })
  test("treats bracketed example values as empty and drops bad entries", () => {
    const p = normalizeProfile({
      nombre: "[TU_NOMBRE]", ciudad: " Pereira, Risaralda ", salario_minimo_mensual: "-5",
      deal_breakers: ["[CONDICIÓN]", "exige turnos nocturnos", 7],
      respuestas_semilla: [{ question: "¿Viaja?", answer: "[RESPUESTA]" }, { answer: "sin pregunta" }, null],
    })
    expect(p).toEqual({
      nombre: "", nombre_completo: "", ciudad: "Pereira, Risaralda", salario_minimo_mensual: null,
      deal_breakers: ["exige turnos nocturnos"], respuestas_semilla: [{ question: "¿Viaja?", answer: "" }],
    })
  })
  test("names the candidate, or uses a neutral phrase", () => {
    expect(candidateNames(normalizeProfile({ nombre: "Ana", nombre_completo: "Ana Prueba" }))).toEqual({ name: "Ana", Name: "Ana", of: "de Ana", full: "Ana Prueba" })
    expect(candidateNames(normalizeProfile({}))).toEqual({ name: "el candidato", Name: "El candidato", of: "del candidato", full: "" })
    expect(normalizeProfile({ nombre: "Ana" }).nombre_completo).toBe("Ana")
  })
  test("seeds answers once per question", () => {
    const seeded = seedAnswers([{ question: " ¿Viaja? ", answer: " Sí " }, { question: "¿viaja?", answer: "No" }, { question: "", answer: "x" }], "2026-01-01")
    expect(seeded).toEqual([{ question: "¿Viaja?", answer: "Sí", updated: "2026-01-01" }])
  })
})

import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadCandidateProfile } from "../src/infrastructure/candidateProfile"
describe("candidate profile file", () => {
  const withDir = (fn: (dir: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), "perfil-"))
    try { fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
  }
  test("prefers candidato.local.json over the example", () => withDir((dir) => {
    writeFileSync(join(dir, "candidato.example.json"), JSON.stringify({ nombre: "[TU_NOMBRE]" }))
    expect(loadCandidateProfile(dir).nombre).toBe("")
    writeFileSync(join(dir, "candidato.local.json"), JSON.stringify({ nombre: "Ana", salario_minimo_mensual: 1500000 }))
    expect(loadCandidateProfile(dir)).toMatchObject({ nombre: "Ana", salario_minimo_mensual: 1500000 })
  }))
  test("falls back to the example when the local file is broken, and to defaults with neither", () => withDir((dir) => {
    expect(loadCandidateProfile(dir).nombre).toBe("")
    writeFileSync(join(dir, "candidato.local.json"), "{ no es json")
    writeFileSync(join(dir, "candidato.example.json"), JSON.stringify({ ciudad: "Medellín, Antioquia" }))
    const errors = console.error
    console.error = () => {}
    try { expect(loadCandidateProfile(dir).ciudad).toBe("Medellín, Antioquia") } finally { console.error = errors }
  }))
  test("the committed example parses and carries no real values", () => {
    const p = loadCandidateProfile(join(import.meta.dir, "..", "no-such-dir"))
    expect(p.nombre).toBe("")
    const example = normalizeProfile(require("../candidato.example.json"))
    expect(example.nombre).toBe("")
    expect(example.salario_minimo_mensual).toBeNull()
    expect(example.deal_breakers).toEqual([])
    expect(example.respuestas_semilla.every((s) => s.answer === "")).toBe(true)
  })
})

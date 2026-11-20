import { describe, expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers"
import { parseRelativeDate, slugify } from "../src/helpers"
import { normalizeId } from "../src/commands/detail"

interface SearchResult {
  meta: { count: number; page: number }
  results: { id: string; title: string; company: string | null; url: string; date: string | null }[]
}

describe("live search", () => {
  test("search returns results with id, title and url", async () => {
    const data = parseJSON<SearchResult>(await runCLI(["search", "-q", "desarrollador full stack", "--limit", "3"]))
    expect(data.results.length).toBeGreaterThan(0)
    for (const r of data.results) {
      expect(r.id).toMatch(/^[0-9A-F]{32}$/)
      expect(r.title.length).toBeGreaterThan(0)
      expect(r.url).toStartWith("https://co.computrabajo.com/ofertas-de-trabajo/")
    }
  })
})

describe("argument validation", () => {
  test("bogus flag exits 1 with JSON error on stderr", async () => {
    const r = await runCLI(["search", "-q", "python", "--bogus", "x"])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toBe("")
    expect(JSON.parse(r.stderr).code).toBe("UNKNOWN_FLAG")
  })

  test("missing --query exits 1", async () => {
    const r = await runCLI(["search", "-l", "Pereira"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("NO_QUERY")
  })

  test("detail without id exits 1", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("NO_ID")
  })
})

describe("helpers", () => {
  test("slugify strips accents and spaces", () => {
    expect(slugify("Técnico en Sistemas")).toBe("tecnico-en-sistemas")
    expect(slugify("  Bogotá, D.C. ")).toBe("bogota-d-c")
  })

  test("parseRelativeDate handles the card wordings", () => {
    const now = new Date(2026, 9, 27, 12, 0)
    expect(parseRelativeDate("Hace 3 horas", now)).toBe("2026-10-27")
    expect(parseRelativeDate("Ayer", now)).toBe("2026-10-26")
    expect(parseRelativeDate("Hace 5 días", now)).toBe("2026-10-22")
    expect(parseRelativeDate("8 de octubre", now)).toBe("2026-10-08")
    expect(parseRelativeDate("30 de diciembre", now)).toBe("2025-12-30")
    expect(parseRelativeDate("Más de 30 días", now)).toBeNull()
  })

  test("normalizeId accepts ids and computrabajo URLs only", () => {
    const id = "2250A81C0E34DA2761373E686DCF3405"
    expect(normalizeId(id.toLowerCase())).toBe(id)
    expect(normalizeId(`https://co.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-x-${id}#lc=x`)).toBe(id)
    expect(normalizeId(`https://evil.example/ofertas-de-trabajo/x-${id}`)).toBeNull()
    expect(normalizeId(`https://co.computrabajo.com.evil.io/ofertas-de-trabajo/x-${id}`)).toBeNull()
  })
})

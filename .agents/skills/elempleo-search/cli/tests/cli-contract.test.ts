import { describe, expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers.ts"

describe("argument errors (offline)", () => {
  test("missing --query exits 1 with JSON error on stderr", async () => {
    const r = await runCLI(["search"])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toBe("")
    expect(JSON.parse(r.stderr).code).toBe("NO_QUERY")
  })

  test("bogus flag exits 1", async () => {
    const r = await runCLI(["search", "-q", "analista", "--bogus", "x"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("UNKNOWN_FLAG")
  })

  test("non-integer --jobage exits 1", async () => {
    const r = await runCLI(["search", "-q", "analista", "--jobage", "0.5"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })

  test("detail with a foreign URL exits 1", async () => {
    const r = await runCLI(["detail", "https://evil.io/co/ofertas-trabajo/x-1886774769"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ID")
  })
})

// Live smoke test - set ELEMPLEO_OFFLINE=1 to skip where there is no network.
describe.skipIf(!!process.env.ELEMPLEO_OFFLINE)("live search", () => {
  test("returns results with id/title/url", async () => {
    const r = await runCLI(["search", "-q", "analista de datos", "--limit", "3"])
    const data = parseJSON<{ meta: { count: number }; results: { id: string; title: string; url: string }[] }>(r)
    expect(data.meta.count).toBeGreaterThan(0)
    for (const job of data.results) {
      expect(job.id).toMatch(/^\d{6,}$/)
      expect(job.title.length).toBeGreaterThan(0)
      expect(job.url.startsWith("https://www.elempleo.com/co/ofertas-trabajo/")).toBe(true)
    }
  })
})

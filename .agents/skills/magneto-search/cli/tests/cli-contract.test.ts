import { describe, expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers.ts"

describe("argument errors (offline)", () => {
  test("bogus flag exits 1 with JSON error on stderr", async () => {
    const r = await runCLI(["search", "-q", "desarrollador", "--bogus", "x"])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toBe("")
    expect(JSON.parse(r.stderr).code).toBe("UNKNOWN_FLAG")
  })

  test("--page beyond 1 is refused, not ignored", async () => {
    const r = await runCLI(["search", "-q", "desarrollador", "--page", "2"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("PAGE_UNSUPPORTED")
  })

  test("--jobage is refused, not ignored", async () => {
    const r = await runCLI(["search", "-q", "desarrollador", "--jobage", "7"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("JOBAGE_UNSUPPORTED")
  })

  test("detail without an id exits 1", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("NO_ID")
  })
})

// Live smoke test - set MAGNETO_OFFLINE=1 to skip where there is no network.
describe.skipIf(!!process.env.MAGNETO_OFFLINE)("live search", () => {
  test("returns results with id/title/url", async () => {
    const r = await runCLI(["search", "-q", "desarrollador", "--limit", "3"])
    const data = parseJSON<{ meta: { count: number }; results: { id: string; title: string; url: string }[] }>(r)
    expect(data.meta.count).toBeGreaterThan(0)
    for (const job of data.results) {
      expect(job.id).toMatch(/-\d{4,}$/)
      expect(job.title.length).toBeGreaterThan(0)
      expect(job.url.startsWith("https://www.magneto365.com/co/empleos/")).toBe(true)
    }
  })
})

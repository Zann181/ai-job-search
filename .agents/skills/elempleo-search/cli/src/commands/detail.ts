import { BASE_URL, htmlFetch, parseJobDetail, stripInvisible, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const EE_HOST = /^(www\.)?elempleo\.com$/i

/**
 * Accept a numeric offer id (the `id` from search results) or an
 * elempleo.com /co/ofertas-trabajo/ URL ending in one. A URL on any other host
 * is rejected - a look-alike host must never decide what we fetch.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{6,}$/.test(trimmed)) return trimmed

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!EE_HOST.test(parsed.hostname)) return null
  const m = parsed.pathname.match(/^\/co\/ofertas-trabajo\/[a-z0-9-]*?-?(\d{6,})\/?$/i)
  return m ? m[1] : null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse an elempleo offer id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    // The slug before the id is cosmetic: the portal resolves the offer by id.
    const html = await htmlFetch(`${BASE_URL}/co/ofertas-trabajo/oferta-${id}`)
    const parsed = html ? parseJobDetail(html, id) : null
    if (!parsed) {
      writeError("Job not found (removed, expired, or unknown id)", "NOT_FOUND")
      return 1
    }
    const job = stripInvisible(parsed)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}${job.remote ? " (remoto)" : ""}`,
        "",
        job.date ? `Posted: ${job.date}` : "",
        job.validThrough ? `Valid through: ${job.validThrough}` : "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        `Status: ${job.isActive ? "ACTIVE" : "CLOSED / EXPIRED"}`,
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}

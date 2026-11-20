import { BASE_URL, htmlFetch, parseJobDetail, stripInvisible, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const MG_HOST = /^(www\.)?magneto365\.com$/i
const SLUG_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d{4,}$/i

/**
 * Accept the `id` from search results (the offer slug, e.g.
 * "desarrollador-ecommerce-1114167") or a magneto365.com /co/empleos/ URL.
 * Magneto resolves offers by the full slug, so a bare number is not enough.
 * A URL on any other host is rejected.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (SLUG_ID.test(trimmed)) return trimmed.toLowerCase()

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!MG_HOST.test(parsed.hostname)) return null
  const m = parsed.pathname.match(/^\/co\/empleos\/([a-z0-9-]+-\d{4,})\/?$/i)
  return m ? m[1].toLowerCase() : null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(
      `Could not parse a Magneto offer slug from "${opts.id}" - pass the id from search results (e.g. "desarrollador-ecommerce-1114167") or the offer URL`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const html = await htmlFetch(`${BASE_URL}/co/empleos/${id}`)
    const parsed = html ? parseJobDetail(html, id) : null
    if (!parsed) {
      writeError("Job not found (removed, expired, or unknown slug)", "NOT_FOUND")
      return 1
    }
    const job = stripInvisible(parsed)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
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

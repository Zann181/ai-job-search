import { detailUrl, htmlFetch, parseJobDetail, stripInvisible, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const CT_HOST = /(^|\.)computrabajo\.com$/i

/**
 * Accept a raw offer ID (32 hex characters) or a Computrabajo offer URL on any
 * computrabajo.com host. URLs on other hosts are rejected: host and path are read
 * through real URL parsing, so look-alike hosts and userinfo tricks fail closed.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^[0-9A-F]{32}$/i.test(trimmed)) return trimmed.toUpperCase()

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (!CT_HOST.test(parsed.hostname)) return null
    const path = parsed.pathname.match(/\/ofertas-de-trabajo\/[^/]*-([0-9A-F]{32})\/?$/i)
    return path ? path[1].toUpperCase() : null
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a Computrabajo offer ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(detailUrl(id))
    if (!html) {
      writeError("Offer not found", "NOT_FOUND")
      return 1
    }
    const job = stripInvisible(parseJobDetail(html, id))

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.tags.length ? `Condiciones: ${job.tags.join(" · ")}` : "",
        job.date ? `Publicada: ${job.date}` : "",
        job.validThrough ? `Vigente hasta: ${job.validThrough}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""))
      process.stdout.write(lines.join("\n").trim() + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}

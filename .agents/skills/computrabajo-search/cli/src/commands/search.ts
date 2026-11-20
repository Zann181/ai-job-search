import { htmlFetch, parseJobCards, searchUrl, stripInvisible, writeError, type JobCard } from "../helpers.js"

export interface SearchOpts {
  query: string
  location?: string
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

/** Keep cards posted within `days`; undated cards ("Más de 30 días") only pass a window over 30 days. */
function withinAge(card: JobCard, days: number, now: Date): boolean {
  if (!card.date) return days > 30 && /m[aá]s de 30/i.test(card.dateText ?? "")
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
  return new Date(`${card.date}T00:00:00`).getTime() >= cutoff.getTime()
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 22).padEnd(22)
    const mod = (c.modality || "—").slice(0, 10).padEnd(10)
    return `${c.id.padEnd(32)} ${title} ${company} ${loc} ${mod} ${c.date || c.dateText || "—"}`
  })
  const header =
    "ID".padEnd(32) + " " + "TITLE".padEnd(40) + " " + "COMPANY".padEnd(24) + " " +
    "LOCATION".padEnd(22) + " " + "MODALITY".padEnd(10) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const now = new Date()
    const html = await htmlFetch(searchUrl(opts.query, opts.location, opts.page))
    let cards = stripInvisible(parseJobCards(html, now))
    if (opts.jobage !== undefined) cards = cards.filter((c) => withinAge(c, opts.jobage!, now))
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.modality || "—"} · ${c.date || c.dateText || "—"}` +
              `${c.salary ? `\n  ${c.salary}` : ""}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: cards.length, page: opts.page }, results: cards }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}

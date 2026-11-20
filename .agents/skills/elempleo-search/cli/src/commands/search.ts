import {
  BASE_URL,
  ageInDays,
  citySlug,
  htmlFetch,
  parseAppliedFilters,
  parseJobCards,
  slugify,
  stripInvisible,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  location?: string
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

/** elempleo search is path-based: /co/ofertas-empleo/[<city>/]trabajo-<query>[/<page>]. */
export function buildUrl(opts: Pick<SearchOpts, "query" | "location" | "page">): string {
  let path = "/co/ofertas-empleo/"
  if (opts.location) path += `${citySlug(opts.location)}/`
  path += `trabajo-${slugify(opts.query)}`
  if (opts.page > 1) path += `/${opts.page}`
  return `${BASE_URL}${path}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 18).padEnd(18)
    const date = c.date || "—"
    return `${c.id.padEnd(11)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(11) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(26) + " " + "LOCATION".padEnd(18) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    const applied = html ? parseAppliedFilters(html) : null

    // elempleo answers an unknown query, an unknown city or a page past the
    // end with an unfiltered listing and HTTP 200. Emitting that would pass
    // every job in Colombia off as a match, so check what the page applied.
    if (opts.location && applied && applied.cities.length === 0) {
      writeError(
        `elempleo did not recognise the location "${opts.location}" (tried "${citySlug(opts.location)}"); use a plain city name such as "Bogotá", "Medellín", "Cali", or drop --location`,
        "LOCATION_NOT_FOUND",
      )
      return 1
    }
    const matched =
      applied !== null && slugify(applied.query) === slugify(opts.query) && applied.pageIndex === opts.page
    let cards = matched ? stripInvisible(parseJobCards(html)) : []
    const total = matched ? applied.total : 0

    if (opts.jobage !== undefined) {
      const max = opts.jobage
      cards = cards.filter((c) => {
        const age = ageInDays(c.dateText)
        return age !== null && age <= max
      })
    }
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      if (cards.length === 0) {
        process.stdout.write("No results.\n")
        return 0
      }
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.dateText || c.date || "—"}${c.salary ? ` · ${c.salary}` : ""}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: cards.length, page: opts.page, total }, results: cards }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}

import {
  BASE_URL,
  htmlFetch,
  locationMatches,
  matchCargo,
  parseCargoIndex,
  parseJobCards,
  slugify,
  stripInvisible,
  titleMatches,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  limit?: number
  format: "json" | "table" | "plain"
}

interface Plan {
  url: string
  source: "cargo" | "city" | "all"
  cargo: string | null
  filterTitle: boolean
  filterLocation: boolean
}

/**
 * Choose the landing page to read and which client-side filters to apply.
 * A query that matches a taxonomy job title reads that title's page; otherwise
 * the city page or the general listing is read and its titles are filtered by
 * the query. (Sector pages exist but render only one card server-side.)
 */
export function planSearch(opts: SearchOpts, cargoSlugs: string[]): Plan {
  const cargo = opts.query ? matchCargo(opts.query, cargoSlugs) : null
  const page = (p: string) => `${BASE_URL}/co/trabajos/${p}`
  if (cargo) {
    return { url: page(`ofertas-empleo-de-${cargo}`), source: "cargo", cargo, filterTitle: false, filterLocation: !!opts.location }
  }
  if (opts.location) {
    const city = slugify(opts.location.split(",")[0])
    return { url: page(`ofertas-empleo-en-${city}`), source: "city", cargo: null, filterTitle: !!opts.query, filterLocation: false }
  }
  return { url: page("buscar"), source: "all", cargo: null, filterTitle: !!opts.query, filterLocation: false }
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 24)
    return `${title} ${company} ${loc}\n  id: ${c.id}`
  })
  const header = "TITLE".padEnd(42) + " " + "COMPANY".padEnd(26) + " LOCATION"
  return [header, "-".repeat(header.length + 16), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    // Job-title pages exist for more titles than the empleos-por-cargo index
    // lists, so try the query's own slug first: Magneto answers an unknown
    // slug with HTTP 500 (htmlFetch returns ""), never with a fallback listing.
    let plan: Plan | null = null
    let html = ""
    if (opts.query) {
      const direct: Plan = {
        url: `${BASE_URL}/co/trabajos/ofertas-empleo-de-${slugify(opts.query)}`,
        source: "cargo",
        cargo: slugify(opts.query),
        filterTitle: false,
        filterLocation: !!opts.location,
      }
      html = await htmlFetch(direct.url)
      if (html) plan = direct
    }
    if (!plan) {
      let cargoSlugs: string[] = []
      if (opts.query) {
        const index = await htmlFetch(`${BASE_URL}/co/trabajos/empleos-por-cargo`)
        cargoSlugs = parseCargoIndex(index)
      }
      plan = planSearch(opts, cargoSlugs)
      html = await htmlFetch(plan.url)
    }
    if (!html) {
      if (plan.source === "city") {
        writeError(
          `Magneto has no city page for "${opts.location}"; use the plain city name ("Bogotá", "Medellín", "Cali", "Barranquilla", ...) or drop --location`,
          "LOCATION_NOT_FOUND",
        )
        return 1
      }
      throw new Error(`Landing page not found: ${plan.url}`)
    }

    let cards = stripInvisible(parseJobCards(html))
    if (plan.filterTitle && opts.query) cards = cards.filter((c) => titleMatches(c.title, opts.query!))
    if (plan.filterLocation && opts.location) cards = cards.filter((c) => locationMatches(c.location, opts.location!))
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
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"}${c.salary ? ` · ${c.salary}` : ""}${c.contractType ? ` · ${c.contractType}` : ""}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: { count: cards.length, page: 1, source: plan.source, cargo: plan.cargo, sourceUrl: plan.url },
            results: cards,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}

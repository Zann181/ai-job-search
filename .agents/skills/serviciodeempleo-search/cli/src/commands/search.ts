// Search command: queries the Servicio Público de Empleo API, filters by city, words and age,
// and emits the offers as /scrape Step 2 cards (title, company, location, date, url; see toCard).
import {
  PAGE_SIZE,
  ageInDays,
  apiGet,
  exactCity,
  fail,
  isExpired,
  posInt,
  queryWords,
  relevance,
  sameCity,
  toCard,
  type Flags,
  type JobCard,
  type SpeRow,
} from "../helpers.js"

function table(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const head = "ID".padEnd(15) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(26) + " " + "LOCATION".padEnd(20) + " DATE"
  const rows = cards.map(
    (c) =>
      `${c.id.padEnd(15)} ${c.title.slice(0, 42).padEnd(42)} ${(c.company ?? "—").slice(0, 26).padEnd(26)} ${(c.location ?? "—").slice(0, 20).padEnd(20)} ${c.date ?? "—"}`,
  )
  return [head, "-".repeat(head.length), ...rows].join("\n")
}

function plain(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  return cards
    .map(
      (c) =>
        `${c.title}\n  ${c.company ?? "—"} · ${c.location ?? "—"} · ${c.dateText ?? c.date ?? "—"}${c.salary ? ` · ${c.salary}` : ""}\n  id: ${c.id}\n  ${c.url}`,
    )
    .join("\n\n")
}

export interface Page {
  resultados: SpeRow[]
  total_registros: number
  totalPages: number
}

export async function search(flags: Flags): Promise<number> {
  const query = typeof flags.query === "string" ? flags.query.trim() : ""
  if (!query) return fail('the --query/-q flag is required (e.g. -q "analista de datos")', "NO_QUERY")
  if (flags.location !== undefined && (typeof flags.location !== "string" || !flags.location.trim())) {
    return fail("--location requires a non-empty value", "BAD_ARG")
  }
  const fmt = flags.format !== undefined ? String(flags.format) : "json"
  if (!["json", "table", "plain"].includes(fmt)) return fail(`--format must be one of json|table|plain, got "${fmt}"`, "BAD_ARG")
  const ints: Record<string, number | undefined> = {}
  for (const name of ["jobage", "page", "limit"]) {
    const v = posInt(flags, name)
    if (v === "bad") return fail(`--${name} must be a whole number of at least 1, got "${flags[name]}"`, "BAD_ARG")
    ints[name] = v
  }
  const page = ints.page ?? 1
  const location = typeof flags.location === "string" ? flags.location.trim() : ""

  try {
    const base: Record<string, string> = {}
    if (flags.remote === true) base.TELETRABAJO = "1"
    // City: an exact MUNICIPIO filter when we can name the value the API stores, else filter client-side.
    let clientCity = false
    if (location) {
      const exact = exactCity(location) ?? location.toUpperCase()
      const probe: Page = await apiGet("/vacantes/resultados", { page: "1", MUNICIPIO: exact })
      if (probe.total_registros > 0) base.MUNICIPIO = exact
      else clientCity = true
    }

    // BUSQUEDA is a substring match on the text: the whole phrase first, then (if the
    // phrase appears nowhere) the longest word, keeping offers that contain every word.
    const words = queryWords(query)
    let term = query
    let first: Page = await apiGet("/vacantes/resultados", { page: String(page), ...base, BUSQUEDA: term })
    let needAll = false
    if (first.total_registros === 0 && words.length > 1) {
      term = [...words].sort((a, b) => b.length - a.length)[0]
      needAll = true
      first = await apiGet("/vacantes/resultados", { page: String(page), ...base, BUSQUEDA: term })
    }

    const rows: SpeRow[] = [...(first.resultados ?? [])]
    // A client-side city or word filter thins each page out: read up to two more pages.
    const extra = clientCity || needAll ? 2 : 0
    for (let p = page + 1; p <= page + extra && p <= (first.totalPages ?? 0); p++) {
      const more: Page = await apiGet("/vacantes/resultados", { page: String(p), ...base, BUSQUEDA: term })
      rows.push(...(more.resultados ?? []))
    }

    let kept = rows.filter((r) => !isExpired(r))
    if (clientCity) kept = kept.filter((r) => sameCity(r, location))
    if (needAll) kept = kept.filter((r) => relevance(r, words).all)
    if (ints.jobage !== undefined) {
      const max = ints.jobage
      kept = kept.filter((r) => {
        const age = ageInDays(r.FECHA_PUBLICACION)
        return age !== null && age <= max
      })
    }
    // Title matches before description-only matches, newest first within each group.
    const titleHit = (r: SpeRow) => (relevance(r, words).title > 0 ? 1 : 0)
    kept = kept
      .map((r, i) => ({ r, i }))
      .sort((a, b) => titleHit(b.r) - titleHit(a.r) || a.i - b.i)
      .map((x) => x.r)

    let cards = kept.map(toCard)
    if (ints.limit !== undefined) cards = cards.slice(0, ints.limit)

    if (fmt === "table") process.stdout.write(table(cards) + "\n")
    else if (fmt === "plain") process.stdout.write(plain(cards) + "\n")
    else
      process.stdout.write(
        JSON.stringify({ meta: { count: cards.length, page, pageSize: PAGE_SIZE, total: first.total_registros }, results: cards }, null, 2) + "\n",
      )
    return 0
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
  }
}

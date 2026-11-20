// Data source: elempleo.com Colombia public search pages. No authentication.
// The search page is server-rendered: each result card carries a JSON
// `data-ga4-offerdata` attribute (id, title, company, location), and the page
// echoes the filters it actually applied in `data-init-filters`. The offer page
// embeds a schema.org JobPosting in JSON-LD. The site's JSON search API
// (/co/api/joboffers/findbyfilter) requires authorization and is not used.
//
// Personal use only: elempleo's terms prohibit automated data collection
// without written permission. Keep volume low.

export const BASE_URL = "https://www.elempleo.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; elempleo-cli/1.0)"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404 or 410 (removed offer). */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-CO,es;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404 || response.status === 410) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  salary: string | null
  /** Approximate ISO date (YYYY-MM-DD) derived from the card's relative age. */
  date: string | null
  /** The card's raw relative age, e.g. "Ayer", "Hace 5 días", "Hace 2 semanas". */
  dateText: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  remote: boolean
  validThrough: string | null
  isActive: boolean
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points (e.g. emoji, U+1F600)
 * decode correctly, and drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Numeric character references: decimal (&#233;) and hexadecimal (&#xE9;).
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

/**
 * Characters a reader of the posting never sees but a model reading this
 * output does: C0/C1 controls other than tab, newline and carriage return, the
 * soft hyphen, bidi marks/embeddings/overrides/isolates, zero-width characters
 * and invisible operators, the BOM, variation selectors, and Unicode tag
 * characters (U+E0000-E007F), which can spell out a whole hidden instruction.
 * Listing text is third-party data, and these arrive raw in a portal's JSON or
 * markup as easily as through a numeric entity.
 */
const INVISIBLE_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F­؜᠎​-‏‪-‮⁠-⁯︀-️﻿\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu

/** Strip INVISIBLE_CHARS from every string in a result, recursively: the CLI's output boundary. */
export function stripInvisible<T>(value: T): T {
  if (typeof value === "string") return value.replace(INVISIBLE_CHARS, "") as T
  if (Array.isArray(value)) return value.map(stripInvisible) as T
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripInvisible(v)])) as T
  }
  return value
}

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"])

/** Whether an opening tag's attributes keep it from rendering: `hidden`, or an inline style that hides it. */
function isHiddenTag(attrs: string): boolean {
  for (const m of attrs.matchAll(/([^\s"'=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const name = m[1].toLowerCase()
    const value = m[2] ?? m[3] ?? m[4] ?? ""
    if (name === "hidden") return true
    if (name === "style" && /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|mso-hide\s*:\s*all)\b/i.test(value)) {
      return true
    }
  }
  return false
}

/**
 * Drop markup a browser never renders - comments (including Word's
 * conditional ones), <script>/<style>/<template> blocks, and elements marked
 * hidden - before tags are stripped. A plain tag strip keeps their text, which
 * hands the model words the posting's reader never saw. CSS-only tricks
 * (off-screen, zero font size) need a renderer and are not caught here.
 */
export function visibleHtml(html: string): string {
  const src = html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "")
  // One pass, collecting what is kept: slicing the string per hidden element
  // would make a page full of them quadratic.
  const open = /<([a-zA-Z][a-zA-Z0-9-]*)(\s[^>]*)?>/g
  const kept: string[] = []
  let from = 0
  let m: RegExpExecArray | null
  while ((m = open.exec(src)) !== null) {
    if (!m[2] || !isHiddenTag(m[2])) continue
    const tag = m[1].toLowerCase()
    let end = open.lastIndex
    if (!VOID_TAGS.has(tag) && !m[0].endsWith("/>")) {
      // Skip to the matching close tag, counting nested same-name elements. An
      // unclosed hidden element runs to the end: failing closed drops visible
      // text, failing open would leak the hidden text.
      const same = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi")
      same.lastIndex = end
      end = src.length
      let depth = 1
      let s: RegExpExecArray | null
      while ((s = same.exec(src)) !== null) {
        if (s[1]) depth--
        else if (!s[0].endsWith("/>")) depth++
        if (depth === 0) {
          end = same.lastIndex
          break
        }
      }
    }
    kept.push(src.slice(from, m.index))
    from = end
    open.lastIndex = end
  }
  kept.push(src.slice(from))
  return kept.join("")
}

function stripTags(html: string): string {
  return visibleHtml(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}


/** Lowercase, accents removed, punctuation dropped, whitespace/hyphen runs collapsed to one hyphen. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * City slug: only the part before the first comma, so "Bogotá, D.C." and
 * "Medellín, Antioquia" become "bogota" and "medellin" like the portal's own paths.
 */
export function citySlug(location: string): string {
  return slugify(location.split(",")[0])
}

/**
 * Days since posting from the card's relative age: "Hoy"/"Hace N horas" (0),
 * "Ayer", "Hace N días", "Hace N semanas", "Hace N mes(es)". Unknown is null.
 */
export function ageInDays(text: string | null): number | null {
  if (!text) return null
  const t = text.toLowerCase()
  if (/minuto|hora|hoy/.test(t)) return 0
  if (/ayer/.test(t)) return 1
  const n = t.match(/(\d+)\s*(d[ií]as?|semanas?|mes(?:es)?)/)
  if (!n) return null
  const k = parseInt(n[1], 10)
  if (n[2].startsWith("sem")) return k * 7
  if (n[2].startsWith("mes")) return k * 30
  return k
}

function isoDaysAgo(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10)
}

/** "2026-9-30" -> "2026-09-30"; anything unparseable -> null. */
export function padDate(text: unknown): string | null {
  if (typeof text !== "string") return null
  const m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null
}

export interface AppliedFilters {
  query: string
  cities: number[]
  pageIndex: number
  total: number | null
}

/**
 * The filters the page actually applied. elempleo silently falls back to an
 * unfiltered listing for an unknown query, an unknown city, or a page past the
 * end - so the caller compares these with what it asked for.
 */
export function parseAppliedFilters(html: string): AppliedFilters | null {
  const m = html.match(/data-init-filters="([^"]*)"/)
  if (!m) return null
  let f: { query?: unknown; cities?: unknown; pageIndex?: unknown }
  try {
    f = JSON.parse(decodeHtmlEntities(m[1]))
  } catch {
    return null
  }
  const total = html.match(/data-results-joboffers="(\d+)"/)
  return {
    query: typeof f.query === "string" ? f.query : "",
    cities: Array.isArray(f.cities) ? f.cities.filter((c): c is number => typeof c === "number") : [],
    pageIndex: typeof f.pageIndex === "number" ? f.pageIndex : 1,
    total: total ? parseInt(total[1], 10) : null,
  }
}

interface Ga4Offer {
  id?: unknown
  title?: unknown
  company?: unknown
  location?: unknown
  salary?: unknown
  list_id?: unknown
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? clean(v) || null : null)

/**
 * Parse the search page. Each real result is a `js-area-bind` block whose
 * `data-ga4-offerdata` is JSON for list "resultado_ofertas" (the page also
 * carries Handlebars templates with the same attribute, which fail to parse
 * and are skipped). Each chunk is parsed independently; duplicates by id are dropped.
 */
export function parseJobCards(html: string, now: Date = new Date()): JobCard[] {
  const results: JobCard[] = []
  const seen = new Set<string>()
  const chunks = html.split(/<div[^>]*class="[^"]*js-area-bind[^"]*"/i).slice(1)

  for (const chunk of chunks) {
    const data = chunk.match(/^[^>]*data-ga4-offerdata="(\{[^"]*\})"/)
    if (!data) continue
    let offer: Ga4Offer
    try {
      offer = JSON.parse(decodeHtmlEntities(data[1]))
    } catch {
      continue
    }
    if (offer.list_id !== "resultado_ofertas") continue
    const id = typeof offer.id === "number" || typeof offer.id === "string" ? String(offer.id) : ""
    if (!/^\d{6,}$/.test(id) || seen.has(id)) continue

    const title = str(offer.title)
    if (!title) continue

    const path = chunk.match(/^[^>]*data-url="(\/co\/ofertas-trabajo\/[^"]+)"/)
    const url = path ? `${BASE_URL}${decodeHtmlEntities(path[1])}` : `${BASE_URL}/co/ofertas-trabajo/oferta-${id}`

    // Stop at the next card so a missing date never borrows a neighbour's.
    const dt = chunk.match(/js-offer-date[^>]*>\s*(?:<i[^>]*><\/i>)?([^<]*)</)
    const dateText = dt ? clean(dt[1]) || null : null
    const age = ageInDays(dateText)

    seen.add(id)
    results.push({
      id,
      title,
      company: str(offer.company),
      location: str(offer.location),
      salary: str(offer.salary),
      date: age === null ? null : isoDaysAgo(age, now),
      dateText,
      url,
    })
  }

  return results
}

interface LdJobPosting {
  "@type"?: string
  title?: string
  description?: string
  datePosted?: string
  employmentType?: string | string[]
  validThrough?: string
  jobLocationType?: string
  hiringOrganization?: { name?: string }
  baseSalary?: { currency?: string; value?: { minValue?: number; maxValue?: number; value?: number } }
}

/** Find the schema.org JobPosting in the page's JSON-LD blocks, or null. */
function findJobPosting(html: string): LdJobPosting | null {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    let data: unknown
    try {
      data = JSON.parse(m[1])
    } catch {
      continue
    }
    const graph = data && typeof data === "object" ? (data as { "@graph"?: unknown })["@graph"] : undefined
    const nodes: unknown[] = Array.isArray(data) ? data : Array.isArray(graph) ? graph : [data]
    for (const n of nodes) {
      if (n && typeof n === "object" && (n as LdJobPosting)["@type"] === "JobPosting") return n as LdJobPosting
    }
  }
  return null
}

/** Render the JSON-LD description (plain text, sometimes with markup) as readable lines. */
function cleanDescription(text: string): string | null {
  // Hidden markup goes before the line split, as in linkedin-search.
  const withBreaks = visibleHtml(text)
    .replace(/\r/g, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const out = withBreaks.split("\n").map(clean).join("\n").replace(/\n{3,}/g, "\n\n").trim()
  return out || null
}

function formatSalary(s: LdJobPosting["baseSalary"]): string | null {
  const v = s?.value
  if (!v) return null
  const fmt = (n: number) => n.toLocaleString("es-CO")
  const cur = s?.currency ? ` ${s.currency}` : ""
  if (typeof v.minValue === "number" && typeof v.maxValue === "number" && v.maxValue > 0) {
    return `${fmt(v.minValue)} - ${fmt(v.maxValue)}${cur}`
  }
  if (typeof v.value === "number" && v.value > 0) return `${fmt(v.value)}${cur}`
  return null
}

/** Parse the offer page. Returns null when it carries no JobPosting (removed or bogus id). */
export function parseJobDetail(html: string, id: string, now: Date = new Date()): JobDetail | null {
  const jp = findJobPosting(html)
  if (!jp || typeof jp.title !== "string" || !jp.title.trim()) return null

  // The JSON-LD has no city; the page shows it in a js-joboffer-city span.
  const city = html.match(/class="js-joboffer-city"[^>]*>([\s\S]*?)<\/span>\s*(?:<\/span>|<span class="d-block)/i)
  const canonical = html.match(/<link rel="canonical" href="(https:\/\/www\.elempleo\.com\/co\/ofertas-trabajo\/[^"]+)"/i)
  const validThrough = padDate(jp.validThrough)
  const today = now.toISOString().slice(0, 10)
  const employmentType = Array.isArray(jp.employmentType) ? jp.employmentType.join(", ") : jp.employmentType ?? null
  const datePosted = padDate(jp.datePosted)

  return {
    id,
    // Titles are stored lowercase in the JSON-LD; the page <h1> keeps the casing but JSON-LD is the stable anchor.
    title: clean(jp.title),
    company: typeof jp.hiringOrganization?.name === "string" ? clean(jp.hiringOrganization.name) || null : null,
    location: city ? clean(city[1]) || null : null,
    salary: formatSalary(jp.baseSalary),
    date: datePosted,
    dateText: null,
    url: canonical ? canonical[1] : `${BASE_URL}/co/ofertas-trabajo/oferta-${id}`,
    description: typeof jp.description === "string" ? cleanDescription(jp.description) : null,
    employmentType: employmentType ? clean(employmentType) || null : null,
    remote: jp.jobLocationType === "TELECOMMUTE",
    validThrough,
    // Absence of an expiry is not proof the posting is open; only a past
    // validThrough marks it closed.
    isActive: validThrough === null || validThrough >= today,
  }
}

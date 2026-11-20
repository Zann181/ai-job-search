// Data source: Magneto365 Colombia (www.magneto365.com) public listing pages.
// No authentication. robots.txt disallows every URL with a query string
// (`Disallow: /*?`) except `paginator[page]`, so the portal's free-text search
// (?q=...) is off limits. What remains are server-rendered landing pages: one
// per job title in Magneto's own taxonomy (/co/trabajos/ofertas-empleo-de-<cargo>),
// per city (/co/trabajos/ofertas-empleo-en-<ciudad>), per sector, and the general
// listing (/co/trabajos/buscar). Each renders its 20 newest offers; the
// paginator parameter is ignored server-side, so only those 20 are reachable.
// The offer page embeds a schema.org JobPosting in JSON-LD.

export const BASE_URL = "https://www.magneto365.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; magneto-cli/1.0)"

/**
 * Fetch HTML with exponential backoff on 429/503/504. Returns "" on a 404 or
 * on a 500: Magneto answers an unknown landing-page or offer slug with HTTP 500,
 * so a 500 here means "no such page", not a transient fault.
 */
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
    if (response.status === 404 || response.status === 500) return ""
    if (response.status === 429 || response.status > 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  /** The offer's URL slug, e.g. "desarrollador-ecommerce-1114167" - `detail` needs the whole slug. */
  id: string
  title: string
  company: string | null
  contractType: string | null
  salary: string | null
  location: string | null
  /** Not rendered on listing pages; use `detail` for datePosted. */
  date: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
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

const STOPWORDS = new Set(["de", "del", "la", "las", "el", "los", "y", "en", "para", "con", "a", "o"])

/** Significant tokens of a query or title: slugified, stopwords dropped. */
export function tokens(text: string): string[] {
  return slugify(text)
    .split("-")
    .filter((t) => t && !STOPWORDS.has(t))
}

/**
 * Pick the taxonomy job-title page for a query: an exact slug match wins,
 * otherwise the shortest slug that contains every query token. null if none.
 */
export function matchCargo(query: string, cargoSlugs: string[]): string | null {
  const want = tokens(query)
  if (want.length === 0) return null
  const exact = slugify(query)
  if (cargoSlugs.includes(exact)) return exact
  const hits = cargoSlugs.filter((s) => {
    const have = new Set(s.split("-"))
    return want.every((t) => have.has(t))
  })
  hits.sort((a, b) => a.length - b.length || a.localeCompare(b))
  return hits[0] ?? null
}

/** Cargo slugs from the /co/trabajos/empleos-por-cargo index page. */
export function parseCargoIndex(html: string): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(/\/co\/trabajos\/ofertas-empleo-de-([a-z0-9-]+)"/g)) out.add(m[1])
  return [...out]
}

/** Whether every query token appears in the title (accent- and case-insensitive). */
export function titleMatches(title: string, query: string): boolean {
  const have = new Set(tokens(title))
  return tokens(query).every((t) => have.has(t))
}

/** Whether a card's location mentions the requested city (accent- and case-insensitive). */
export function locationMatches(location: string | null, wanted: string): boolean {
  if (!location) return false
  const city = slugify(wanted.split(",")[0])
  return city !== "" && `-${slugify(location)}-`.includes(`-${city}-`)
}

/**
 * Parse a listing page: split on the job-card <article> elements and parse
 * each chunk independently so one malformed card cannot break the rest. The
 * page renders desktop and mobile variants of some cards, so duplicates by id
 * are dropped.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const seen = new Set<string>()
  const chunks = html.split(/<article\b[^>]*class="[^"]*magneto-ui-card-jobs/i).slice(1)

  for (const raw of chunks) {
    const endIdx = raw.indexOf("</article>")
    const chunk = endIdx === -1 ? raw : raw.slice(0, endIdx)

    const link = chunk.match(/<a\s[^>]*href="https:\/\/www\.magneto365\.com\/co\/empleos\/([a-z0-9-]+-\d+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!link) continue
    const id = link[1]
    if (seen.has(id)) continue
    const title = clean(link[2])
    if (!title) continue

    // After the title: <h3>Company | Contract</h3><p>Salary, </p><p>Location</p>.
    const after = chunk.slice(chunk.indexOf(link[0]) + link[0].length)
    const h3 = after.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)
    let company: string | null = null
    let contractType: string | null = null
    if (h3) {
      const parts = clean(h3[1]).split(/\s*\|\s*/)
      company = parts[0] || null
      contractType = parts.slice(1).join(" | ") || null
    }
    const ps = [...after.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => clean(m[1]))
    const salary = ps[0] ? ps[0].replace(/,\s*$/, "") || null : null
    const location = ps[1] || null

    seen.add(id)
    results.push({
      id,
      title,
      company,
      contractType,
      salary,
      location,
      date: null,
      url: `${BASE_URL}/co/empleos/${id}`,
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
  hiringOrganization?: { name?: string }
  jobLocation?: unknown
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

/** Render the JSON-LD description (flattened text with stray markup/entities) as readable lines. */
function cleanDescription(text: string): string | null {
  // Hidden markup goes before the line split, as in linkedin-search.
  const withBreaks = visibleHtml(text)
    .replace(/\r/g, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  // Magneto descriptions carry &nbsp;, which clean() decodes after collapsing whitespace.
  const out = withBreaks
    .split("\n")
    .map((line) => clean(line).replace(/[  ]{2,}/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return out || null
}

/** Cities from JSON-LD jobLocation (a Place or an array of them). */
function ldLocation(loc: unknown): string | null {
  const places = Array.isArray(loc) ? loc : loc ? [loc] : []
  const names = new Set<string>()
  for (const p of places) {
    // addressLocality is a string on some offers and an array of cities on others.
    const locality = (p as { address?: { addressLocality?: unknown } })?.address?.addressLocality
    for (const name of Array.isArray(locality) ? locality : [locality]) {
      if (typeof name === "string" && name.trim()) names.add(clean(name))
    }
  }
  return [...names].join(" - ") || null
}

function formatSalary(s: LdJobPosting["baseSalary"]): string | null {
  const v = s?.value
  if (!v) return null
  const fmt = (n: number) => n.toLocaleString("es-CO")
  const cur = s?.currency ? ` ${s.currency}` : ""
  if (typeof v.minValue === "number" && typeof v.maxValue === "number" && v.maxValue > 0) {
    return v.minValue === v.maxValue ? `${fmt(v.maxValue)}${cur}` : `${fmt(v.minValue)} - ${fmt(v.maxValue)}${cur}`
  }
  if (typeof v.value === "number" && v.value > 0) return `${fmt(v.value)}${cur}`
  return null
}

/** Parse the offer page. Returns null when it carries no JobPosting. */
export function parseJobDetail(html: string, id: string, now: Date = new Date()): JobDetail | null {
  const jp = findJobPosting(html)
  if (!jp || typeof jp.title !== "string" || !jp.title.trim()) return null

  const validThrough = typeof jp.validThrough === "string" ? jp.validThrough.slice(0, 10) : null
  const today = now.toISOString().slice(0, 10)
  const employmentType = Array.isArray(jp.employmentType) ? jp.employmentType.join(", ") : jp.employmentType ?? null

  return {
    id,
    title: clean(jp.title),
    company: typeof jp.hiringOrganization?.name === "string" ? clean(jp.hiringOrganization.name) || null : null,
    contractType: null,
    salary: formatSalary(jp.baseSalary),
    location: ldLocation(jp.jobLocation),
    date: typeof jp.datePosted === "string" ? jp.datePosted.slice(0, 10) : null,
    url: `${BASE_URL}/co/empleos/${id}`,
    description: typeof jp.description === "string" ? cleanDescription(jp.description) : null,
    employmentType: employmentType ? clean(employmentType) || null : null,
    validThrough,
    // Absence of an expiry is not proof the posting is open; only a past
    // validThrough marks it closed.
    isActive: validThrough === null || validThrough >= today,
  }
}

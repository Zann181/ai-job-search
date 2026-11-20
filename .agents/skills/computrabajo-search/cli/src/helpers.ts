// Data source: Computrabajo Colombia public pages (co.computrabajo.com). No authentication.
// Search: /trabajo-de-<query-slug>[-en-<city-slug>][?p=<page>] returns HTML with one
// <article class="box_offer"> per result. Detail: /ofertas-de-trabajo/oferta-de-trabajo-de-x-<ID>
// returns HTML whose schema.org JobPosting JSON-LD carries the structured fields.
// robots.txt disallows the pubdate=/sal=/cont=/... filter params, so --jobage is applied
// client-side to the parsed card dates instead of being sent to the server.

export const BASE_URL = "https://co.computrabajo.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; computrabajo-cli/1.0)"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
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
      signal: AbortSignal.timeout(15000),
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
    if (response.status === 404) return ""
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
  date: string | null // ISO yyyy-mm-dd, derived from the card's relative date
  dateText: string | null // the card's own wording, e.g. "Hace 5 días"
  modality: string | null // "Remoto", "Presencial y remoto", or null (on-site / unstated)
  salary: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  validThrough: string | null
  tags: string[]
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

/** Lowercase, strip accents, and hyphenate - the slug form Computrabajo uses in search paths. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function searchUrl(query: string, location: string | undefined, page: number): string {
  let path = `/trabajo-de-${slugify(query)}`
  if (location) path += `-en-${slugify(location)}`
  return `${BASE_URL}${path}${page > 1 ? `?p=${page}` : ""}`
}

export function detailUrl(id: string): string {
  return `${BASE_URL}/ofertas-de-trabajo/oferta-de-trabajo-de-x-${id}`
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Turn a card's relative date ("Hace 3 horas", "Ayer", "Hace 5 días", "8 de octubre")
 * into an ISO date. "Más de 30 días" and anything unrecognised return null.
 */
export function parseRelativeDate(text: string, now: Date = new Date()): string | null {
  const t = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
  let m: RegExpMatchArray | null
  if ((m = t.match(/^hace (\d+) (minuto|hora)s?$/))) {
    const ms = parseInt(m[1], 10) * (m[2] === "hora" ? 3600000 : 60000)
    return isoDate(new Date(now.getTime() - ms))
  }
  if (t === "hoy") return isoDate(now)
  if (t === "ayer") return isoDate(new Date(now.getTime() - 86400000))
  if ((m = t.match(/^hace (\d+) dias?$/))) {
    return isoDate(new Date(now.getTime() - parseInt(m[1], 10) * 86400000))
  }
  if ((m = t.match(/^(\d{1,2}) de ([a-z]+)$/)) && MONTHS[m[2]]) {
    const d = new Date(now.getFullYear(), MONTHS[m[2]] - 1, parseInt(m[1], 10))
    // A date later than today belongs to last year.
    if (d.getTime() > now.getTime()) d.setFullYear(d.getFullYear() - 1)
    return isoDate(d)
  }
  return null
}

/**
 * Parse the search page: split on each <article class="box_offer"> and parse every
 * chunk independently so one malformed card cannot break the rest.
 */
export function parseJobCards(html: string, now: Date = new Date()): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<article\s+class="box_offer\b/).slice(1)

  for (const raw of chunks) {
    const endIdx = raw.indexOf("</article>")
    const chunk = endIdx === -1 ? raw : raw.slice(0, endIdx)
    const idMatch = chunk.match(/data-id=['"]([0-9A-F]{16,})['"]/i)
    if (!idMatch) continue
    const id = idMatch[1]

    const link = chunk.match(/<a[^>]*class="js-o-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!link) continue
    const title = clean(link[2])
    if (!title) continue
    const href = decodeHtmlEntities(link[1]).split("#")[0]
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`

    const comp = chunk.match(/<p class="dFlex vm_fx fs16 fc_base mt5">([\s\S]*?)<\/p>/i)
    // The company line may open with a review-score badge ("4,5" + star); drop it.
    const company = comp ? clean(comp[1].replace(/<span class="fx_none[\s\S]*?<span class="star"><\/span>\s*<\/span>/i, "")) || null : null

    const loc = chunk.match(/<p class="fs16 fc_base mt5">\s*<span class="mr10">([\s\S]*?)<\/span>/i)
    const location = loc ? clean(loc[1]) || null : null

    const dt = chunk.match(/<p class="fs13 fc_aux mt15">([\s\S]*?)<\/p>/i)
    const dateText = dt ? clean(dt[1]) || null : null
    const date = dateText ? parseRelativeDate(dateText, now) : null

    let modality: string | null = null
    let salary: string | null = null
    for (const m of chunk.matchAll(/<span class="icon (i_[a-z_]+)"><\/span>([\s\S]*?)<\/span>/gi)) {
      const text = clean(m[2])
      if (!text) continue
      if (m[1] === "i_home" || m[1] === "i_home_office") modality = text
      else if (m[1] === "i_salary") salary = text
    }

    results.push({ id, title, company, location, date, dateText, modality, salary, url })
  }

  return results
}

/** Pull the schema.org JobPosting object out of the page's JSON-LD blocks. */
function findJobPosting(html: string): Record<string, any> | null {
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: any
    try {
      data = JSON.parse(m[1])
    } catch {
      continue
    }
    const nodes: any[] = Array.isArray(data) ? data : data["@graph"] ?? [data]
    for (const n of nodes) {
      if (n && n["@type"] === "JobPosting") return n
    }
  }
  return null
}

/** Render description HTML as text, keeping paragraph and line breaks. */
function htmlToText(html: string): string | null {
  const withBreaks = visibleHtml(html)
    .replace(/\r?\n/g, "<br>")
    .replace(/\s+/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return withBreaks.split("\n").map(clean).join("\n").replace(/\n{3,}/g, "\n\n").trim() || null
}

/** Parse the single-offer detail page (visible markup first, JSON-LD for structured fields). */
export function parseJobDetail(html: string, id: string): JobDetail {
  const jp = findJobPosting(html)

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const title = (h1 ? clean(h1[1]) : "") || (jp?.title ? clean(String(jp.title)) : "") || "(untitled)"

  const company = jp?.hiringOrganization?.name ? clean(String(jp.hiringOrganization.name)) || null : null
  const addr = jp?.jobLocation?.address
  const location = addr
    ? [addr.addressLocality, addr.addressRegion].filter(Boolean).map((s: string) => clean(s)).join(", ") || null
    : null

  // The visible description sits under the "Descripción de la oferta" heading:
  // a row of tag spans (salary, contract, schedule, modality), then the text.
  const tags: string[] = []
  let description: string | null = null
  const head = html.search(/Descripci(?:ó|&#xF3;|&oacute;)n de la oferta<\/h2>/i)
  if (head !== -1) {
    const section = html.slice(head)
    const tagBlock = section.match(/<div class="mbB">([\s\S]*?)<\/div>/i)
    if (tagBlock) {
      for (const t of tagBlock[1].matchAll(/<span class="tag[^"]*">([\s\S]*?)<\/span>/gi)) {
        const text = clean(t[1])
        if (text) tags.push(text)
      }
    }
    const body = section.match(/<p class="mbB">([\s\S]*?)<\/p>/i)
    if (body) description = htmlToText(body[1])
  }
  if (!description && jp?.description) description = htmlToText(String(jp.description))

  const modality = tags.find((t) => /remoto|presencial/i.test(t)) ?? null
  const salary = tags.find((t) => /\$|a convenir/i.test(t)) ?? null

  return {
    id,
    title,
    company,
    location,
    date: jp?.datePosted ? String(jp.datePosted).slice(0, 10) : null,
    dateText: null,
    modality,
    salary,
    url: jp?.url ? String(jp.url) : detailUrl(id),
    description,
    employmentType: jp?.employmentType ? String(jp.employmentType) : null,
    validThrough: jp?.validThrough ? String(jp.validThrough).slice(0, 10) : null,
    tags,
  }
}

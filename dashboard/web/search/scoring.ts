// Reading and scoring portal offers against a CV profile. Pure functions: the
// Buscador tab calls them on every render, so filters apply without searching again.
import type { CvProfile, Offer } from "../api"

export interface Row extends Offer {
  portal: string
  portalId: string
  detail?: { description: string; remote: boolean }
  /** Detail fetch failed or is not available: do not try again. */
  skipDetail?: boolean
}

export interface Score {
  total: number
  hits: string[]
  parts: { role: number; kw: number; exp: number; place: number }
  years: number | null
}

export interface Filters {
  city: string
  remote: boolean
  expMax: number | null
  useAdvanced: boolean
  include: string[]
  exclude: string[]
  minScore: number
  hideConfidential: boolean
}

export const DEFAULT_EXCLUDE = "senior, sr, líder, lider, jefe, gerente, director, coordinador, arquitecto, especialista, practicante, aprendiz"

const SENIOR = /\b(senior|sr|semi ?senior|ssr|lider|jefe|gerente|director|coordinador|arquitecto|especialista|experto|principal)\b/
const REMOTE = /remot|teletrabajo|home ?office|trabajo en casa|100 ?% ?virtual|desde casa/
const STOP = new Set(["de", "en", "y", "la", "el", "del", "para"])
const NUMBER_WORDS: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, diez: 10 }

export const norm = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
export const words = (s: string) => s.split(",").map((w) => norm(w).trim()).filter(Boolean)

/** Years of experience an offer asks for, from its title and description; null when it says nothing. */
export function parseExp(text: string): number | null {
  const t = norm(text)
  if (/sin experiencia|no requiere experiencia|primer empleo|no se requiere experiencia/.test(t)) return 0
  const re = /(\d+(?:[.,]\d+)?|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|diez)\)?\s*\+?\s*(anos?|meses)\b/g
  for (const m of t.matchAll(re)) {
    const near = t.slice(Math.max(0, (m.index ?? 0) - 60), (m.index ?? 0) + 70)
    if (!/experiencia|exp\./.test(near)) continue
    const n = Number(m[1].replace(",", ".")) || NUMBER_WORDS[m[1]]
    if (n == null || Number.isNaN(n)) continue
    return m[2].startsWith("mes") ? n / 12 : n
  }
  return null
}

const textOf = (j: Row) => `${j.title} ${j.detail?.description ?? ""}`
export const yearsOf = (j: Row) => parseExp(textOf(j))
export const isRemote = (j: Row) => j.detail?.remote === true || REMOTE.test(norm(`${j.title} ${j.location ?? ""} ${j.detail?.description ?? ""}`))
export const inCity = (j: Row, city: string) => {
  const c = norm(city.trim())
  return !c || norm(j.location).includes(c)
}

/** 0-100 fit of an offer for a CV profile, with the parts that make it up. */
export function scoreFor(j: Row, prof: CvProfile, city: string): Score {
  const title = norm(j.title)
  const hay = norm(textOf(j))
  const roleTokens = norm(prof.role).split(/\W+/).filter((w) => w.length > 2 && !STOP.has(w))
  const tokenHits = roleTokens.filter((w) => title.includes(w.slice(0, Math.max(5, w.length - 2)))).length
  let role = roleTokens.length ? 25 * (tokenHits / roleTokens.length) : 0
  // The portal returned it for this role (only counts when the title agrees at least a little).
  if (tokenHits > 0 && norm(prof.queries[0]) === norm(j.query)) role += 10
  role = Math.min(35, role)

  const hits = prof.keywords.slice(1).filter((k) => hay.includes(norm(k)))
  const kw = Math.min(40, hits.length * 8)

  const years = yearsOf(j)
  let exp = 7 // not stated
  if (years != null) exp = years <= 1 ? 15 : years <= 2 ? 6 : -15
  if (SENIOR.test(title)) exp -= 25
  else if (/junior|jr\b|trainee/.test(title)) exp += 5

  const place = (inCity(j, city) && !j.unverifiedLocation) || isRemote(j) ? 10 : 0
  const total = Math.max(0, Math.min(100, Math.round(role + kw + exp + place)))
  return { total, hits, parts: { role: Math.round(role), kw, exp: Math.round(exp), place }, years }
}

export type Tier = "hi" | "mid" | "lo"
export const tierOf = (n: number): Tier => (n >= 70 ? "hi" : n >= 40 ? "mid" : "lo")
export const TIER_LABEL: Record<Tier, string> = { hi: "Alta afinidad (70+)", mid: "Afinidad media (40–69)", lo: "Baja afinidad (<40)" }

const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Why an offer is left out, or null when it stays. City and experience always apply; the advanced filters only when switched on. */
export function rejectReason(j: Row, best: Score, f: Filters): string | null {
  const years = yearsOf(j)
  if (f.expMax != null && years != null && years > f.expMax) return `Pide ${Math.round(years * 10) / 10} años (máx. ${f.expMax})`
  // Outside the city only remote offers stay (portals fall back to the whole country when the city has none).
  if (f.city.trim() && !inCity(j, f.city)) {
    if (!f.remote) return "Fuera de la ciudad"
    if (j.detail ? !isRemote(j) : !j.unverifiedLocation) return "Fuera de la ciudad y no es remoto"
  }
  if (!f.useAdvanced) return null
  const place = norm(`${j.title} ${j.company ?? ""}`)
  const hit = f.exclude.find((w) => new RegExp(`(^|\\W)${escapeRe(w)}(\\W|$)`).test(place))
  if (hit) return `Excluida: "${hit}"`
  if (f.include.length && j.detail && !f.include.some((w) => norm(`${textOf(j)} ${j.company ?? ""}`).includes(w))) return "No menciona tus palabras clave"
  if (f.hideConfidential && /confidencial/i.test(j.company ?? "")) return "Empresa confidencial"
  if (best.total < f.minScore) return `Afinidad ${best.total} < ${f.minScore}`
  return null
}

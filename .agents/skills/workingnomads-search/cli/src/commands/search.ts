// Working Nomads search: fetches the board, normalizes every offer to the /scrape Step 2
// fields (title, company, location, date, url) and formats the result list.
// cli.ts parses the flags and calls these. Zero runtime dependencies.

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  salary: string | null
  date: string | null
  dateText: string | null
  url: string
  description: string | null
  employmentType: string | null
  remote: boolean
}

export const UA = "Mozilla/5.0 (personal job search)"

export async function get(url: string, as: "json" | "text" = "json"): Promise<any> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: as === "json" ? "application/json" : "*/*" }, signal: AbortSignal.timeout(25000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`)
  return as === "json" ? res.json() : res.text()
}

export const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }
export function text(html: unknown): string {
  return String(html ?? "")
    .replace(/<\s*(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return Number.isFinite(n) ? String.fromCodePoint(n) : m
      }
      return ENT[e.toLowerCase()] ?? m
    })
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim()
}

export function iso(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : /^\d+$/.test(String(v)) ? Number(v) : NaN
  const d = Number.isFinite(n) ? new Date(n < 1e11 ? n * 1000 : n) : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
export const ageDays = (d: string | null) => (d ? Math.max(0, Math.floor((Date.now() - Date.parse(d)) / 86400000)) : null)
export function ageText(d: string | null): string | null {
  const a = ageDays(d)
  return a === null ? null : a === 0 ? "hoy" : a === 1 ? "hace 1 día" : `hace ${a} días`
}
export function money(min: unknown, max: unknown, cur?: unknown, per?: unknown): string | null {
  const a = Number(min) || 0
  const b = Number(max) || 0
  if (!a && !b) return null
  const rng = a && b && a !== b ? `${a.toLocaleString("en-US")}-${b.toLocaleString("en-US")}` : (a || b).toLocaleString("en-US")
  return `${rng} ${cur ?? "USD"}${per ? "/" + per : ""}`
}

export const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
export const STOP = new Set(["de", "del", "la", "el", "en", "y", "a", "para", "con", "of", "the", "and", "in", "for"])
// Most boards publish in English: a Spanish word also matches its usual English equivalents.
export const ES_EN: Record<string, string[]> = {
  desarrollador: ["developer", "engineer", "programmer"], desarrolladora: ["developer", "engineer"], programador: ["developer", "programmer"],
  analista: ["analyst"], datos: ["data"], ingeniero: ["engineer"], ingeniera: ["engineer"], diseñador: ["designer"], disenador: ["designer"],
  gerente: ["manager"], director: ["director", "head"], ventas: ["sales"], mercadeo: ["marketing"], contador: ["accountant"], contable: ["accounting"],
  soporte: ["support"], administrador: ["administrator", "admin"], redactor: ["writer", "copywriter"], escritor: ["writer"], traductor: ["translator"],
  recursos: ["resources"], humanos: ["human", "hr"], servicio: ["service"], cliente: ["customer"], atencion: ["support", "service"], producto: ["product"],
  proyecto: ["project"], proyectos: ["project"], calidad: ["quality", "qa"], seguridad: ["security"], nube: ["cloud"], finanzas: ["finance"], financiero: ["financial"],
  asistente: ["assistant"], coordinador: ["coordinator"], consultor: ["consultant"], docente: ["teacher"], profesor: ["teacher"], abogado: ["lawyer", "legal"],
}
export const words = (q: string) => norm(q).split(/[^a-z0-9+#.]+/).filter((w) => w.length > 1 && !STOP.has(w))

// Places where a Colombian can work: "anywhere"-style remote, LatAm, or the city/country asked for.
export const WIDE = /anywhere|worldwide|world wide|global|latam|latin america|americas|south america|todo el mundo|remote/i
export function geoOk(loc: string | null, want: string): boolean {
  if (!want) return true
  const l = norm(loc ?? "")
  if (!l) return true
  return WIDE.test(l) || l.includes(norm(want)) || l.includes("colombia")
}

export async function fetchAll(_q?: string, _en?: string): Promise<JobCard[]> {
  const d = await get("https://www.workingnomads.com/api/exposed_jobs/")
  return (Array.isArray(d) ? d : []).map((j: any): JobCard => {
    const date = iso(j.pub_date)
    return {
      id: String(j.url),
      title: String(j.title ?? ""),
      company: j.company_name ?? null,
      location: j.location || "Remoto",
      salary: null,
      date,
      dateText: ageText(date),
      url: String(j.url),
      description: text(`${j.tags ?? ""}\n${j.description ?? ""}`) || null,
      employmentType: j.category_name ?? null,
      remote: true,
    }
  })
}

export function table(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const head = "TITLE".padEnd(48) + " " + "COMPANY".padEnd(26) + " " + "LOCATION".padEnd(22) + " DATE"
  const rows = cards.map((c) => `${c.title.slice(0, 48).padEnd(48)} ${(c.company ?? "—").slice(0, 26).padEnd(26)} ${(c.location ?? "—").slice(0, 22).padEnd(22)} ${c.date?.slice(0, 10) ?? "—"}`)
  return [head, "-".repeat(head.length), ...rows].join("\n")
}
export function plain(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  return cards.map((c) => `${c.title}\n  ${c.company ?? "—"} · ${c.location ?? "—"} · ${c.dateText ?? c.date ?? "—"}${c.salary ? " · " + c.salary : ""}\n  ${c.url}`).join("\n\n")
}

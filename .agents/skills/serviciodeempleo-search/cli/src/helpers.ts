// Helpers for the Servicio Público de Empleo (SPE) job search.
// buscadordeempleo.gov.co is a single-page app over a public JSON API
// (https://www.buscadordeempleo.gov.co/backbue/v1). It has no robots.txt (404).
// The API treats every query parameter other than `page` as a column filter:
// `BUSQUEDA` is a substring match over the offer text, `MUNICIPIO` and
// `DEPARTAMENTO` are exact matches (accents and capitals included), `TELETRABAJO=1`
// keeps remote offers. Results come newest first, 50 per page.

export const API = "https://www.buscadordeempleo.gov.co/backbue/v1"
export const PAGE_SIZE = 50
const UA = "Mozilla/5.0 (personal job search; low volume)"

// The site's server sends only its own certificate, not the intermediate
// (GeoTrust TLS RSA CA G1, issued by DigiCert Global Root G2). Where the OS has not
// cached that intermediate, TLS fails with "unable to verify the first certificate".
// Verification stays ON: we add the public intermediate (fetched from the CA's AIA
// URL) next to the normal root store, so the chain is still checked up to a root.
import { rootCertificates } from "node:tls"
import { readFileSync } from "node:fs"
const INTERMEDIATE = readFileSync(new URL("./geotrust-tls-rsa-ca-g1.pem", import.meta.url), "utf-8")
const TLS_CA = [...rootCertificates, INTERMEDIATE]

export interface SpeRow {
  CODIGO_VACANTE: string
  TITULO_VACANTE: string
  DESCRIPCION_VACANTE: string | null
  NIVEL_ESTUDIOS: string | null
  RANGO_SALARIAL: string | null
  DEPARTAMENTO: string | null
  MUNICIPIO: string | null
  TIPO_CONTRATO: string | null
  CARGO: string | null
  FECHA_VENCIMIENTO: string | null
  FECHA_PUBLICACION: string | null
  TELETRABAJO: number | null
  MESES_EXPERIENCIA_CARGO: number | null
  DETALLES_PRESTADOR: { NOMBRE_PRESTADOR?: string; URL_DETALLE_VACANTE?: string }[] | null
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  salary: string | null
  /** ISO date (YYYY-MM-DD) the offer was published. */
  date: string | null
  dateText: string | null
  url: string
  description: string | null
  employmentType: string | null
  remote: boolean
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** Lowercase, accent-free, single-spaced: for comparing what the user typed with what the API returns. */
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Exact MUNICIPIO values the API stores for cities users usually type without the accent or the suffix. */
const CITY_ALIASES: Record<string, string> = {
  bogota: "BOGOTÁ, D.C.",
  "bogota dc": "BOGOTÁ, D.C.",
  medellin: "MEDELLÍN",
  cucuta: "CÚCUTA",
  ibague: "IBAGUÉ",
  monteria: "MONTERÍA",
  cartagena: "CARTAGENA DE INDIAS",
  popayan: "POPAYÁN",
  "san andres": "SAN ANDRÉS",
}

/** The exact MUNICIPIO value to filter on, or null when the city is not in the alias table (the search then filters client-side). */
export function exactCity(city: string): string | null {
  const n = norm(city)
  return CITY_ALIASES[n] ?? null
}

export function sameCity(row: SpeRow, city: string): boolean {
  return norm(row.MUNICIPIO ?? "").startsWith(norm(city).replace(/ dc$/, ""))
}

export async function apiGet(path: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
    tls: { ca: TLS_CA },
  } as RequestInit)
  if (!res.ok) throw new Error(`HTTP ${res.status} from buscadordeempleo.gov.co`)
  const body = await res.json()
  if (body && typeof body === "object" && "error" in body) throw new Error(String(body.error))
  return body
}

const isoDay = (s: string | null) => (s ? s.slice(0, 10) : null)

export function ageInDays(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 86_400_000))
}

export function ageText(days: number | null): string | null {
  if (days === null) return null
  return days === 0 ? "Hoy" : days === 1 ? "Ayer" : `Hace ${days} días`
}

export function isExpired(row: SpeRow, now = Date.now()): boolean {
  const t = row.FECHA_VENCIMIENTO ? Date.parse(row.FECHA_VENCIMIENTO) : NaN
  return !Number.isNaN(t) && t < now - 86_400_000
}

export function toCard(row: SpeRow): JobCard {
  const prestador = row.DETALLES_PRESTADOR?.[0]
  const date = isoDay(row.FECHA_PUBLICACION)
  const months = row.MESES_EXPERIENCIA_CARGO ?? 0
  // The experience sits in its own column; the buscador reads it from the text, so say it there.
  const exp = months > 0 ? `\n\nExperiencia mínima: ${months} meses.` : months === 0 ? "\n\nSin experiencia requerida." : ""
  const desc = row.DESCRIPCION_VACANTE ? row.DESCRIPCION_VACANTE.trim() + exp : exp.trim() || null
  const place = [row.MUNICIPIO, row.DEPARTAMENTO].filter((x, i, a) => x && a.indexOf(x) === i).join(", ")
  return {
    id: row.CODIGO_VACANTE,
    title: (row.TITULO_VACANTE ?? "").trim(),
    company: prestador?.NOMBRE_PRESTADOR ?? null,
    location: place || null,
    salary: row.RANGO_SALARIAL && row.RANGO_SALARIAL !== "A Convenir" ? row.RANGO_SALARIAL : null,
    date,
    dateText: ageText(ageInDays(row.FECHA_PUBLICACION)),
    url:
      prestador?.URL_DETALLE_VACANTE ??
      `https://www.buscadordeempleo.gov.co/#/?busqueda=${encodeURIComponent(row.CODIGO_VACANTE)}`,
    description: desc,
    employmentType: row.TIPO_CONTRATO,
    remote: row.TELETRABAJO === 1,
  }
}

/** Distinctive words of a query (4+ letters, no connectors): what a phrase search falls back to. */
const STOP = new Set(["para", "con", "del", "los", "las", "una", "uno"])
export function queryWords(q: string): string[] {
  return norm(q)
    .split(/[^a-z0-9+#.]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
}

/** Does every word of the query show up (by 5-letter stem) in the offer? Title hits count double for ranking. */
export function relevance(row: SpeRow, words: string[]): { all: boolean; title: number } {
  const title = norm(`${row.TITULO_VACANTE ?? ""} ${row.CARGO ?? ""}`)
  const text = norm(`${title} ${row.DESCRIPCION_VACANTE ?? ""}`)
  const stem = (w: string) => w.slice(0, Math.max(4, Math.min(w.length, 6)))
  return {
    all: words.every((w) => text.includes(stem(w))),
    title: words.filter((w) => title.includes(stem(w))).length,
  }
}

/** Parsed command line: positional words in `_`, every flag by its long name. */
export interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

/** Writes the JSON error and returns the exit code 1. */
export const fail = (error: string, code: string): number => (writeError(error, code), 1)

/** A whole number of at least 1, undefined when absent, "bad" otherwise. */
export function posInt(flags: Flags, name: string): number | undefined | "bad" {
  const raw = flags[name]
  if (raw === undefined) return undefined
  const v = typeof raw === "string" ? Number(raw.trim()) : NaN
  return Number.isInteger(v) && v >= 1 ? v : "bad"
}

// Per-offer CV customization: one small JSON per offer in job_scraper/cv_custom/, folded into
// the /apply prompt. The CV tab that wrote them was removed; existing files still apply.
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { ROOT } from "./files"

const CUSTOM_DIR = join(ROOT, "job_scraper", "cv_custom")
const MAX_STR = 4000

export interface CvCustom {
  /** Key of datos_cv.json > perfiles to start from ("" = the agent picks). */
  perfil: string
  titular: string
  resumen: string
  enfasis: string[]
  omitir: string[]
  /** Keys of datos_cv.json > proyectos to include ([] = the agent picks). */
  proyectos: string[]
  incluir_foto: boolean
  instrucciones: string
  updated?: string
}

export const EMPTY_CUSTOM: CvCustom = { perfil: "", titular: "", resumen: "", enfasis: [], omitir: [], proyectos: [], incluir_foto: true, instrucciones: "" }

const str = (v: unknown, max = MAX_STR) => String(v ?? "").slice(0, max)
const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 300).trim()).filter(Boolean).slice(0, 40) : [])

export function cleanCustom(raw: any): CvCustom {
  return {
    perfil: str(raw?.perfil, 60), titular: str(raw?.titular, 200), resumen: str(raw?.resumen),
    enfasis: list(raw?.enfasis), omitir: list(raw?.omitir), proyectos: list(raw?.proyectos),
    incluir_foto: raw?.incluir_foto !== false, instrucciones: str(raw?.instrucciones),
  }
}

const safe = (key: string) => key.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 120) || "oferta"
export const customPath = (key: string) => join(CUSTOM_DIR, `${safe(key)}.json`)

/** The saved customization of an offer, or null when there is none. */
export function readCustom(key: string): CvCustom | null {
  const p = customPath(key)
  if (!existsSync(p)) return null
  try { return { ...EMPTY_CUSTOM, ...cleanCustom(JSON.parse(readFileSync(p, "utf-8"))) } } catch { return null }
}

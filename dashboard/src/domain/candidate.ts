// The candidate's personal settings the dashboard needs (name in prompts, salary floor,
// deal-breakers for the Chrome run, first answers). Pure: the values come from a JSON file
// the infrastructure layer reads, so no personal data lives in code.

export interface SeedAnswer { question: string; answer: string }

export interface CandidateProfile {
  /** Name used in agent prompts; "" when unknown. */
  nombre: string
  /** Full name for the profile line of each prompt; falls back to nombre. */
  nombre_completo: string
  ciudad: string
  /** Monthly floor in COP; null disables the floor check. */
  salario_minimo_mensual: number | null
  /** Conditions that stop the Chrome run before it fills anything. */
  deal_breakers: string[]
  /** Answers seeded into the answer memory the first time the dashboard runs. */
  respuestas_semilla: SeedAnswer[]
}

export const EMPTY_PROFILE: CandidateProfile = {
  nombre: "", nombre_completo: "", ciudad: "", salario_minimo_mensual: null, deal_breakers: [], respuestas_semilla: [],
}

/** "[TU_NOMBRE]"-style values in the example file count as not filled in. */
const isPlaceholder = (s: string) => /^\[.*\]$/.test(s.trim())

const text = (v: unknown) => (typeof v === "string" && !isPlaceholder(v) ? v.trim() : "")

/** Accepts any JSON value and returns a complete profile: bad or missing fields fall back to empty. */
export function normalizeProfile(raw: unknown): CandidateProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY_PROFILE }
  const o = raw as Record<string, unknown>
  const floor = Number(o.salario_minimo_mensual)
  const list = (v: unknown) => (Array.isArray(v) ? v.map(text).filter(Boolean) : [])
  const seeds = Array.isArray(o.respuestas_semilla) ? o.respuestas_semilla : []
  return {
    nombre: text(o.nombre),
    nombre_completo: text(o.nombre_completo) || text(o.nombre),
    ciudad: text(o.ciudad),
    salario_minimo_mensual: Number.isFinite(floor) && floor > 0 ? floor : null,
    deal_breakers: list(o.deal_breakers),
    respuestas_semilla: seeds
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .map((s) => ({ question: text(s.question), answer: text(s.answer) }))
      .filter((s) => s.question),
  }
}

/** How prompts refer to the candidate: the name, or a neutral phrase when none is set. */
export function candidateNames(p: CandidateProfile) {
  const name = p.nombre || p.nombre_completo
  const full = p.nombre_completo || name
  return name
    ? { name, Name: name, of: `de ${name}`, full }
    : { name: "el candidato", Name: "El candidato", of: "del candidato", full: "" }
}

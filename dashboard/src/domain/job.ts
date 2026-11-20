// Job aggregate: one scraped posting, plus what the candidate has done with it.

// Tracker status vocabulary, as defined by /outcome.
export const TRACKER_STATUSES = [
  "drafted", "applied", "interview", "offer", "hired",
  "rejected", "no_response", "offer_declined", "withdrawn",
] as const
export type TrackerStatus = (typeof TRACKER_STATUSES)[number]

export const isTrackerStatus = (s: string): s is TrackerStatus => (TRACKER_STATUSES as readonly string[]).includes(s)

const FINAL: TrackerStatus[] = ["hired", "rejected", "no_response", "offer_declined", "withdrawn"]
export const isFinal = (s: TrackerStatus | null) => s != null && FINAL.includes(s)

export interface Critique {
  probabilidad: number
  nivel: string
  factores: string[]
  recomendacion: string
  date: string
}

export interface TrackingCheck {
  date: string
  open: boolean | null
  applicants: string | null
  deadline: string | null
  salary: string | null
  error?: string
}

/** One agent run on this job, as the job's history shows it. */
export interface HistoryEntry {
  date: string
  kind: "postulacion" | "documentos" | "probabilidad"
  ok: boolean
  /** Postulación runs: the application was sent / the CV reached the portal. */
  sent?: boolean
  cv_uploaded?: boolean
  /** Chrome left the form filled for the candidate to submit. */
  ready?: boolean
  reason?: string
  /** The agent's own summary, minus the machine-readable last line. */
  summary: string
  cost_usd?: number
}

/** Dashboard-owned facts about a job. */
export interface JobPreferences {
  selected?: boolean
  cv_confirmed?: boolean
  critique?: Critique
  check?: TrackingCheck
  history?: HistoryEntry[]
}

/** Posting as /scrape and /rank stored it. */
export interface Posting {
  key: string
  title: string
  company: string
  location: string | null
  url: string
  portal: string
  posted_date: string | null
  deadline: string | null
  scrape_status: string
  rank_score: number | null
  rank_verdict: string | null
  location_verdict: string | null
  language_gate: string | null
  language_note: string | null
  strengths: string[]
  gaps: string[]
  /** Posting text as the portal gave it (offers marked in the Buscador; /scrape entries may lack it). */
  description?: string | null
  salary?: string | null
  /** CV profile the Buscador scored the offer against. */
  profile?: string | null
}

export interface ApplicationRecord {
  status: TrackerStatus | null
  cv_tex: string | null
  cover_tex: string | null
  cv_pdf: string | null
  cover_pdf: string | null
}

/** Where the job sits in the search funnel; drives the pipeline indicator. */
export type Stage = "nueva" | "puntuada" | "seleccionada" | "cv" | "confirmada" | "aplicada" | "entrevista" | "cerrada"

export interface Job extends Posting, JobPreferences {
  application: ApplicationRecord
  stage: Stage
  deadline_effective: string | null
}

export function stageOf(p: Posting, prefs: JobPreferences, app: ApplicationRecord): Stage {
  const s = app.status
  if (s && isFinal(s)) return "cerrada"
  if (s === "interview" || s === "offer") return "entrevista"
  if (s === "applied") return "aplicada"
  if (app.cv_pdf && prefs.cv_confirmed) return "confirmada"
  if (app.cv_pdf) return "cv"
  if (prefs.selected) return "seleccionada"
  return p.rank_score != null ? "puntuada" : "nueva"
}

export function buildJob(p: Posting, prefs: JobPreferences, app: ApplicationRecord): Job {
  return {
    ...p,
    ...prefs,
    application: app,
    stage: stageOf(p, prefs, app),
    deadline_effective: prefs.check?.deadline ?? p.deadline,
  }
}

/** A Chrome application needs a generated CV the candidate has confirmed. */
export function canApplyWithChrome(job: Job): string | null {
  if (!job.application.cv_pdf) return "Esta oferta aún no tiene CV generado."
  if (!job.cv_confirmed) return "Confirma el CV antes de aplicar."
  if (job.check?.open === false) return "La oferta parece cerrada."
  return null
}

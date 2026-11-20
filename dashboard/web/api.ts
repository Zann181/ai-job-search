// Typed client for the dashboard API. Types mirror src/domain (kept separate so
// the browser bundle never imports server code).

export type Stage = "nueva" | "puntuada" | "seleccionada" | "cv" | "confirmada" | "aplicada" | "entrevista" | "cerrada"

export interface HistoryEntry {
  date: string
  kind: "postulacion" | "documentos" | "probabilidad"
  ok: boolean
  sent?: boolean
  cv_uploaded?: boolean
  ready?: boolean
  reason?: string
  summary: string
  cost_usd?: number
}

export interface Job {
  key: string
  title: string
  company: string
  location: string | null
  url: string
  portal: string
  posted_date: string | null
  deadline_effective: string | null
  rank_score: number | null
  rank_verdict: string | null
  location_verdict: string | null
  language_gate: string | null
  language_note: string | null
  strengths: string[]
  gaps: string[]
  description?: string | null
  salary?: string | null
  profile?: string | null
  selected?: boolean
  cv_confirmed?: boolean
  critique?: { probabilidad: number; nivel: string; factores: string[]; recomendacion: string; date: string }
  history?: HistoryEntry[]
  check?: { date: string; open: boolean | null; applicants: string | null; deadline: string | null; salary: string | null; error?: string }
  application: { status: string | null; cv_tex: string | null; cover_tex: string | null; cv_pdf: string | null; cover_pdf: string | null }
  stage: Stage
}

export interface Answer { question: string; answer: string; updated: string; seen_in?: string }

export type DocKind = "cv" | "cover"
export interface CompileResult { ok: boolean; pages: number | null; pageLimit: number; errors: string[]; pdf: string | null }

export interface TemplateInfo {
  id: string
  path: string
  role: string
  headline: string
  subject: string
  keywords: string[]
  confirm: { line: number; text: string }[]
  anexos: boolean
  pdf: string | null
  pages: number | null
  updated: string
}
export interface TemplateSaved { result: CompileResult; info: TemplateInfo }
export interface PhotoInfo { exists: boolean; updated: string | null; bytes: number }
export type TemplateImport = { id: string; exists: true } | { id: string; exists: false; result: CompileResult; info: TemplateInfo }

export interface TaskInfo { type: string; label: string; model: string; needsJob: boolean }

export interface Task {
  id: string
  type: string
  key?: string
  model: string
  label: string
  status: "queued" | "running" | "done" | "error"
  created: string
  finished?: string
  cost_usd?: number
  log?: string[]
  result?: string
  outcome?: { sent: boolean; ready?: boolean; newQuestions: number; reason: string }
}

export interface PortalInfo { id: string; label: string; market: string; defaultOn: boolean }
export interface CvProfile { id: string; role: string; keywords: string[]; queries: string[]; source: string }
export interface Offer {
  url: string
  title: string
  company: string | null
  location: string | null
  salary?: string | null
  date?: string | null
  dateText?: string | null
  query: string
  unverifiedLocation: boolean
}
export interface PortalResult { portal: string; label: string; ok: boolean; error?: string; results: Offer[] }
export interface SearchQuery { queries: string[]; city: string; remote: boolean; jobage: number | null; portals: string[] }
export interface MarkedOffer { url: string; title: string; company: string; location: string; portal: string; score: number; profile: string; description: string }

export const TOKEN = document.querySelector<HTMLMetaElement>('meta[name="dash-token"]')?.content ?? ""
export const STALE_EVENT = "dash:stale-token"

async function call<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "x-dash-token": TOKEN, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 403 && data.error === "Token inválido") {
    // The server mints a new token on every start, so a tab opened before a restart keeps the old one.
    window.dispatchEvent(new Event(STALE_EVENT))
    throw new Error("El dashboard se reinició: recarga la página")
  }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data as T
}

const jobPath = (key: string, action: string) => `/api/jobs/${encodeURIComponent(key)}/${action}`

export const api = {
  jobs: () => call<{ jobs: Job[]; statuses: string[]; tasks: TaskInfo[] }>("GET", "/api/jobs"),
  tasks: () => call<{ tasks: Task[] }>("GET", "/api/tasks"),
  task: (id: string) => call<Task>("GET", `/api/tasks/${id}`),
  run: (type: string, key?: string) => call<Task>("POST", "/api/tasks", { type, key }),
  batch: (type: "apply" | "critique", keys: string[], force = false) =>
    call<{ queued: number; skipped: { key: string; reason: string }[] }>("POST", "/api/tasks/batch", { type, keys, force }),
  browser: () => call<{ running: boolean }>("GET", "/api/browser"),
  openBrowser: (url?: string) => call<{ running: boolean }>("POST", "/api/browser/open", url ? { url } : {}),
  profile: () => call<{ salario_minimo_mensual: number | null; ciudad: string }>("GET", "/api/perfil"),
  answers: () => call<{ answers: Answer[] }>("GET", "/api/answers"),
  saveAnswer: (question: string, answer: string) => call<{ answers: Answer[] }>("PUT", "/api/answers", { question, answer }),
  removeAnswer: (question: string) => call<{ answers: Answer[] }>("POST", "/api/answers", { question, remove: true }),
  select: (key: string, selected: boolean) => call<Job>("POST", jobPath(key, "select"), { selected }),
  confirmCv: (key: string, confirmed: boolean) => call<Job>("POST", jobPath(key, "confirm-cv"), { confirmed }),
  status: (key: string, status: string) => call<Job>("POST", jobPath(key, "status"), { status }),
  tex: (key: string, doc: DocKind) => call<{ path: string; content: string }>("GET", `${jobPath(key, "tex")}?doc=${doc}`),
  saveTex: (key: string, doc: DocKind, content: string) => call<CompileResult>("PUT", `${jobPath(key, "tex")}?doc=${doc}`, { content }),
  searchPortals: () => call<PortalInfo[]>("GET", "/api/search/portals"),
  cvProfiles: () => call<CvProfile[]>("GET", "/api/search/profiles"),
  search: (q: SearchQuery) =>
    call<{ portals: PortalResult[] }>("GET", `/api/search?${new URLSearchParams({
      q: q.queries.join("|"), city: q.city, remote: q.remote ? "1" : "0", jobage: q.jobage ? String(q.jobage) : "", portals: q.portals.join(","),
    })}`),
  offerDetail: (portal: string, url: string) =>
    call<{ detail: { description: string; remote: boolean } | null }>("GET", `/api/search/detail?${new URLSearchParams({ portal, url })}`),
  markOffer: (offer: MarkedOffer) => call<Job>("POST", "/api/search/mark", { offer }),
  unmarkOffer: (key: string) => call<Job>("POST", "/api/search/unmark", { key }),
  templates: () => call<{ templates: TemplateInfo[]; photo: PhotoInfo }>("GET", "/api/plantillas"),
  importTemplate: (name: string, content: string, overwrite = false) => call<TemplateImport>("POST", "/api/plantillas/importar", { name, content, overwrite }),
  savePhoto: (base64Jpeg: string) => call<PhotoInfo>("PUT", "/api/plantillas/foto", { data: base64Jpeg }),
  template: (id: string) => call<{ path: string; content: string }>("GET", `/api/plantillas/${id}`),
  saveTemplate: (id: string, content: string) => call<TemplateSaved>("PUT", `/api/plantillas/${id}`, { content }),
  sheets: (pdf: string) => call<SheetSet>("GET", `/api/hojas?${new URLSearchParams({ pdf })}`),
  compileTemplate: (id: string) => call<TemplateSaved>("POST", `/api/plantillas/${id}/compile`),
  followUp: (key?: string) => call<unknown>("POST", "/api/follow-up", key ? { key } : {}),
}

export const pdfUrl = (rel: string) => `/pdf/${rel.split("/").map(encodeURIComponent).join("/")}?t=${encodeURIComponent(TOKEN)}`
export interface SheetSet { pdf: string; pages: number; stamp: number }
export const sheetUrl = (pdf: string, n: number, v: number | string) => `/hoja?${new URLSearchParams({ pdf, n: String(n), t: TOKEN, v: String(v) })}`
export const photoUrl = (v: number | string) => `/plantilla-foto?t=${encodeURIComponent(TOKEN)}&v=${v}`

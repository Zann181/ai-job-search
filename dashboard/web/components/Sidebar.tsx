import type { Job } from "../api"

export type ViewId = "todas" | "shortlist" | "seleccionadas" | "documentos" | "aplicadas" | "cerradas"

/** Main-menu section a view belongs to. */
export type Mode = "ofertas" | "postulaciones"

export const DEFAULT_VIEW: ViewId = "shortlist"

const GROUPS: { mode: Mode; title: string }[] = [
  { mode: "ofertas", title: "Ofertas" },
  { mode: "postulaciones", title: "Postulación" },
]

export const VIEWS: { id: ViewId; mode: Mode; label: string; match: (j: Job) => boolean }[] = [
  { id: "shortlist", mode: "ofertas", label: "Mejor puntuadas", match: (j) => (j.rank_score ?? 0) >= 60 && j.stage !== "cerrada" },
  { id: "todas", mode: "ofertas", label: "Todas", match: () => true },
  { id: "cerradas", mode: "ofertas", label: "Cerradas", match: (j) => j.stage === "cerrada" || j.check?.open === false },
  { id: "seleccionadas", mode: "postulaciones", label: "Por postular", match: (j) => j.stage === "seleccionada" },
  { id: "documentos", mode: "postulaciones", label: "Con CV", match: (j) => j.stage === "cv" || j.stage === "confirmada" },
  { id: "aplicadas", mode: "postulaciones", label: "En proceso", match: (j) => j.stage === "aplicada" || j.stage === "entrevista" },
]

export function Sidebar({ jobs, view, onView }: { jobs: Job[]; view: ViewId; onView: (v: ViewId) => void }) {
  return (
    <nav className="sidebar" aria-label="Vistas">
      {GROUPS.map((g) => (
        <div key={g.mode}>
          <h2 className="sidebar-title">{g.title}</h2>
          <ul>
            {VIEWS.filter((v) => v.mode === g.mode).map((v) => (
              <li key={v.id}>
                <button className={view === v.id ? "active" : ""} aria-current={view === v.id ? "page" : undefined} onClick={() => onView(v.id)}>
                  <span>{v.label}</span>
                  <span className="count">{jobs.filter(v.match).length}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

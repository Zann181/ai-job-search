import type { Job } from "../api"
import { Pipeline, STAGE_LABEL } from "./Pipeline"
import { Probability, ScoreBadge } from "./Score"

const daysUntil = (iso: string) => Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000)

function Deadline({ iso }: { iso: string | null }) {
  if (!iso) return <span className="muted">—</span>
  const d = daysUntil(iso)
  if (d < 0) return <span className="muted">Vencida</span>
  return <span className={d <= 7 ? "urgent" : ""}>{d <= 7 ? `En ${d} d` : iso}</span>
}

interface Props {
  jobs: Job[]
  selectedKey: string | null
  onSelect: (k: string) => void
  checked: Set<string>
  onCheck: (keys: string[], on: boolean) => void
  onPreview: (k: string) => void
}

export function JobTable({ jobs, selectedKey, onSelect, checked, onCheck, onPreview }: Props) {
  const all = jobs.length > 0 && jobs.every((j) => checked.has(j.key))
  const some = jobs.some((j) => checked.has(j.key))
  if (jobs.length === 0) {
    return <div className="empty"><p>No hay ofertas en esta vista.</p><p className="muted">Usa Buscar ofertas para traer nuevas.</p></div>
  }
  return (
    <table className="jobs" aria-label="Ofertas">
      <thead>
        <tr>
          <th scope="col" className="col-check">
            <input type="checkbox" aria-label="Elegir todas las de esta vista" checked={all}
              ref={(el) => { if (el) el.indeterminate = some && !all }}
              onChange={(e) => onCheck(jobs.map((j) => j.key), e.target.checked)} />
          </th>
          <th scope="col">Ajuste</th>
          <th scope="col">Oferta</th>
          <th scope="col" className="col-loc">Ubicación</th>
          <th scope="col">Etapa</th>
          <th scope="col">Probabilidad</th>
          <th scope="col">Cierre</th>
          <th scope="col">CV</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((j) => (
          <tr
            key={j.key}
            className={j.key === selectedKey ? "selected" : ""}
            aria-selected={j.key === selectedKey}
            tabIndex={j.key === selectedKey ? 0 : -1}
            onClick={() => onSelect(j.key)}
          >
            <td className="col-check" onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" aria-label={`Elegir ${j.title}`} checked={checked.has(j.key)} onChange={(e) => onCheck([j.key], e.target.checked)} />
            </td>
            <td><ScoreBadge score={j.rank_score} /></td>
            <td className="title-cell">
              <span className="job-title">{j.selected && <span className="star" aria-label="Seleccionada">★ </span>}{j.title}</span>
              <span className="muted">{j.company}</span>
            </td>
            <td className="muted col-loc">{j.location ?? "—"}</td>
            <td><Pipeline stage={j.stage} compact /><span className="sr-only">{STAGE_LABEL[j.stage]}</span></td>
            <td><Probability value={j.critique?.probabilidad} /></td>
            <td><Deadline iso={j.deadline_effective} /></td>
            <td>
              {j.application.cv_pdf
                ? <button className="secondary mini" onClick={(e) => { e.stopPropagation(); onPreview(j.key) }} aria-label={`Ver CV de ${j.title}`}>{j.cv_confirmed ? "✓ Ver" : "Ver"}</button>
                : <span className="muted">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

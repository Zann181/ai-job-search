import { useEffect, useState } from "react"
import { api, pdfUrl, type DocKind, type Job } from "../api"
import { SheetDesk, useSheetZoom, ZoomControl } from "./SheetView"
import { JobDescription } from "./OfferDetails"
import { belowFloor, formatCop } from "../salary"
import { History } from "./History"
import { Pipeline } from "./Pipeline"
import { Probability, ScoreBadge } from "./Score"

const STATUS_LABEL: Record<string, string> = {
  drafted: "Borrador", applied: "Aplicada", interview: "Entrevista", offer: "Oferta recibida", hired: "Contratado",
  rejected: "Rechazada", no_response: "Sin respuesta", offer_declined: "Oferta rechazada", withdrawn: "Retirada",
}

export type Tab = "resumen" | "seguimiento" | "docs"
const TABS: [Tab, string][] = [["resumen", "Resumen"], ["seguimiento", "Seguimiento"], ["docs", "Documentos"]]

// The floor comes from dashboard/candidato.local.json through the server; asked once per page load.
let floorRequest: Promise<number | null> | null = null
function useSalaryFloor(): number | null {
  const [floor, setFloor] = useState<number | null>(null)
  useEffect(() => {
    if (!floorRequest) {
      floorRequest = api.profile().then((p) => p.salario_minimo_mensual ?? null).catch(() => { floorRequest = null; return null })
    }
    let live = true
    floorRequest.then((f) => { if (live) setFloor(f) })
    return () => { live = false }
  }, [])
  return floor
}

interface Props {
  job: Job
  statuses: string[]
  busy: boolean
  onSelect: (v: boolean) => void
  onConfirmCv: (v: boolean) => void
  onStatus: (s: string) => void
  onRun: (type: string) => void
  onFollowUp: () => void
  onChrome: () => void
  onEdit: (doc: DocKind) => void
  tab: Tab
  onTab: (t: Tab) => void
  onClose: () => void
}

export function Inspector({ job, statuses, busy, onSelect, onConfirmCv, onStatus, onRun, onFollowUp, onChrome, onEdit, tab, onTab: setTab, onClose }: Props) {
  const [showPdf, setShowPdf] = useState<DocKind>("cv")
  const [zoom, setZoom] = useSheetZoom()
  const floor = useSalaryFloor()
  const flags = [
    job.language_gate === "FLAG" && `Idioma: ${job.language_note ?? "requisito por encima de tu nivel"}`,
    job.location_verdict === "FLAG" && "Ubicación o desplazamientos por revisar",
    job.check?.open === false && "La oferta parece cerrada",
    floor !== null && belowFloor(job.check?.salary, floor) && `Salario publicado (${job.check!.salary}) por debajo de tu piso de ${formatCop(floor)}`,
  ].filter(Boolean) as string[]
  const pdf = showPdf === "cv" ? job.application.cv_pdf : job.application.cover_pdf
  const chromeBlocked = !job.application.cv_pdf ? "Genera el CV primero" : !job.cv_confirmed ? "Confirma el CV primero" : null
  const lastRun = (job.history ?? []).filter((h) => h.kind === "postulacion").at(-1)
  const awaitingSubmit = !!lastRun?.ready && job.application.status !== "applied"

  return (
    <aside className="inspector" aria-label="Detalle de la oferta">
      <header>
        <button className="secondary back" onClick={onClose}>‹ Ofertas</button>
        <h2>{job.title}</h2>
        <p className="muted">{job.company} · {job.location ?? "Sin ubicación"}</p>
        <JobDescription job={job} />
        <a href={job.url} target="_blank" rel="noreferrer noopener">Ver oferta en {job.portal.replace("-search", "")}</a>
      </header>

      <Pipeline stage={job.stage} />

      {flags.length > 0 && (
        <ul className="flags" role="list">
          {flags.map((f) => <li key={f}><span aria-hidden="true">⚠ </span>{f}</li>)}
        </ul>
      )}

      <div className="tabs" role="tablist" aria-label="Secciones">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "resumen" && <>
      <section>
        <h3>Ajuste y probabilidad</h3>
        <div className="metrics">
          <div><span className="metric-label">Ajuste al perfil</span><ScoreBadge score={job.rank_score} /></div>
          <div><span className="metric-label">Probabilidad</span><Probability value={job.critique?.probabilidad} /></div>
        </div>
        {job.critique ? (
          <div className="critique">
            <ul>{job.critique.factores.map((f) => <li key={f}>{f}</li>)}</ul>
            <p><strong>Recomendación:</strong> {job.critique.recomendacion}</p>
            <p className="muted small">Estimado el {job.critique.date}. Es una estimación de la IA, no un dato del portal.</p>
          </div>
        ) : <p className="muted">Aún sin crítica.</p>}
        <button className="secondary" disabled={busy} onClick={() => onRun("critique")}>
          {job.critique ? "Recalcular probabilidad" : "Estimar probabilidad"}
        </button>
      </section>

      <section className="two-col">
        <div><h3>Fortalezas</h3><ul>{job.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>
        <div><h3>Brechas</h3><ul>{job.gaps.map((s) => <li key={s}>{s}</li>)}</ul></div>
      </section>
      </>}

      {tab === "seguimiento" && <section>
        <h3>Seguimiento</h3>
        <dl className="facts">
          <dt>Estado de la oferta</dt><dd>{job.check ? (job.check.open == null ? `No se pudo revisar (${job.check.error})` : job.check.open ? "Abierta" : "Cerrada") : "Sin revisar"}</dd>
          <dt>Postulantes</dt><dd>{job.check?.applicants ?? "No publicado por el portal"}</dd>
          <dt>Cierre</dt><dd>{job.deadline_effective ?? "Sin fecha"}</dd>
          <dt>Salario</dt><dd>{job.check?.salary ?? "—"}</dd>
          <dt>Publicada</dt><dd>{job.posted_date ?? "—"}</dd>
          <dt>Última revisión</dt><dd>{job.check ? new Date(job.check.date).toLocaleString("es-CO") : "—"}</dd>
        </dl>
        <div className="row">
          <label className="toggle">
            <input type="checkbox" checked={!!job.selected} onChange={(e) => onSelect(e.target.checked)} />
            Seguir esta oferta (revisión automática cada 6 h)
          </label>
          <button className="secondary" disabled={busy} onClick={onFollowUp}>Revisar ahora</button>
        </div>
        <label className="field">
          Estado de mi postulación
          <select value={job.application.status ?? ""} onChange={(e) => e.target.value && onStatus(e.target.value)}>
            <option value="">Sin registrar</option>
            {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
          </select>
        </label>
        <h3>Historial</h3>
        <History entries={job.history ?? []} />
      </section>}

      {tab === "docs" && <section>
        <h3>Documentos</h3>
        {job.application.cv_pdf ? (
          <>
            <div className="segmented" role="tablist" aria-label="Documento">
              <button role="tab" aria-selected={showPdf === "cv"} className={showPdf === "cv" ? "on" : ""} onClick={() => setShowPdf("cv")}>CV</button>
              <button role="tab" aria-selected={showPdf === "cover"} disabled={!job.application.cover_pdf} className={showPdf === "cover" ? "on" : ""} onClick={() => setShowPdf("cover")}>Carta</button>
            </div>
            {pdf && <div className="doc-sheet"><div className="doc-sheet-head"><ZoomControl zoom={zoom} onZoom={setZoom} /></div><SheetDesk pdf={pdf} stamp={pdf} zoom={zoom} label={showPdf === "cv" ? "el CV" : "la carta"} /></div>}
            <div className="row">
              <button className="secondary" onClick={() => onEdit(showPdf)}>Editar LaTeX</button>
              {pdf && <a className="button secondary" href={pdfUrl(pdf)} download={pdf.split("/").pop()}>Descargar PDF</a>}
              <label className="toggle">
                <input type="checkbox" checked={!!job.cv_confirmed} onChange={(e) => onConfirmCv(e.target.checked)} />
                CV revisado y confirmado
              </label>
            </div>
          </>
        ) : <p className="muted">Sin CV para esta oferta.</p>}
        <button className="secondary" disabled={busy} onClick={() => onRun("apply")} title="Adapta a la descripción del cargo una copia de la plantilla del perfil (cv/plantillas/), y redacta la carta">
          {job.application.cv_pdf ? "Regenerar CV y carta desde la plantilla" : "Generar CV y carta desde la plantilla"}
        </button>
        <p className="muted small">{job.profile ? `Parte de la plantilla «${job.profile}» y la adapta a la descripción del cargo.` : "Elige la plantilla que más requisitos cubre y la adapta a la descripción del cargo."}{job.description ? "" : " Esta oferta no tiene descripción guardada: se descargará del portal."}</p>
      </section>}

      <footer className="inspector-actions">
        <button className="primary" disabled={busy || !!chromeBlocked} onClick={onChrome} title={chromeBlocked ?? undefined}>
          Postular con Chrome
        </button>
        {job.application.cv_pdf && !job.cv_confirmed ? (
          <label className="toggle">
            <input type="checkbox" checked={false} onChange={(e) => e.target.checked && onConfirmCv(true)} />
            Revisé el CV y lo confirmo (habilita Postular con Chrome)
          </label>
        ) : chromeBlocked && <span className="muted small">{chromeBlocked}.</span>}
        {awaitingSubmit && <>
          <span className="muted small">El formulario quedó listo en Brave: revísalo y envíalo tú.</span>
          <button className="secondary" onClick={() => onStatus("applied")}>Ya la envié</button>
        </>}
      </footer>
    </aside>
  )
}

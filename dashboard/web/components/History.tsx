import type { HistoryEntry } from "../api"

const KIND: Record<HistoryEntry["kind"], string> = { postulacion: "Postulación", documentos: "CV y carta", probabilidad: "Probabilidad" }

function verdict(e: HistoryEntry): { text: string; tone: string } {
  if (!e.ok) return { text: "Falló", tone: "error" }
  if (e.kind !== "postulacion") return { text: "Listo", tone: "ok" }
  if (e.sent) return { text: "Enviada", tone: "ok" }
  if (e.ready) return { text: "Lista para que confirmes", tone: "ok" }
  return { text: "No enviada", tone: "warn" }
}

/** What each agent run did on this offer, newest first. */
export function History({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) return <p className="muted">Aún no hay acciones sobre esta oferta.</p>
  return (
    <ol className="history" aria-label="Historial de la oferta">
      {entries.map((e) => {
        const v = verdict(e)
        return (
          <li key={e.date + e.kind}>
            <details>
              <summary>
                <span className="history-head">
                  <strong>{KIND[e.kind]}</strong>
                  <span className={`pill ${v.tone}`}>{v.text}</span>
                  {e.kind === "postulacion" && e.cv_uploaded && <span className="pill ok">CV subido</span>}
                </span>
                <span className="muted small">
                  {new Date(e.date).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                  {e.cost_usd != null && ` · US$${e.cost_usd.toFixed(2)}`}
                </span>
                {e.reason && <span className="history-reason">{e.reason}</span>}
              </summary>
              <pre className="history-summary">{e.summary || "Sin resumen."}</pre>
            </details>
          </li>
        )
      })}
    </ol>
  )
}

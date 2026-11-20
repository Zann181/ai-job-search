import { useEffect, useRef, useState } from "react"
import { api, type Answer } from "../api"

/**
 * The answer memory Chrome uses to complete application forms. Questions a form
 * asked that have no answer yet come first; answering them lets the next run send.
 */
export function AnswersDialog({ onClose, onChange }: { onClose: () => void; onChange: (pending: number) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [newQ, setNewQ] = useState("")
  const [newA, setNewA] = useState("")
  const [error, setError] = useState<string | null>(null)

  const apply = (list: Answer[]) => {
    setAnswers(list)
    setDrafts(Object.fromEntries(list.map((a) => [a.question, a.answer])))
    onChange(list.filter((a) => !a.answer.trim()).length)
  }

  useEffect(() => {
    ref.current?.showModal()
    api.answers().then((r) => apply(r.answers)).catch((e) => setError(e.message))
  }, [])

  const run = (p: Promise<{ answers: Answer[] }>) => p.then((r) => { setError(null); apply(r.answers) }).catch((e) => setError(e.message))
  const sorted = [...answers].sort((a, b) => Number(!!a.answer.trim()) - Number(!!b.answer.trim()))
  const pending = answers.filter((a) => !a.answer.trim()).length

  return (
    <dialog ref={ref} className="dialog answers" onClose={onClose} aria-labelledby="answers-title">
      <h2 id="answers-title">Respuestas para formularios</h2>
      <p className="muted">
        Chrome usa estas respuestas para llenar las preguntas de cada postulación y solo envía si todas quedan respondidas.
        {pending > 0 && <> Faltan <strong>{pending}</strong>: respóndelas y vuelve a postular.</>}
      </p>
      {error && <p className="banner" role="alert">{error}</p>}
      <ul className="answer-list">
        {sorted.map((a) => {
          const draft = drafts[a.question] ?? ""
          const changed = draft !== a.answer
          return (
            <li key={a.question} className={a.answer.trim() ? "" : "pending"}>
              <label className="field">
                <span>{!a.answer.trim() && <span className="tag">Falta</span>}{a.question}</span>
                <span className="muted small">{a.seen_in ? `Apareció en: ${a.seen_in}` : ""}</span>
                <input
                  value={draft}
                  placeholder="Escribe tu respuesta"
                  onChange={(e) => setDrafts({ ...drafts, [a.question]: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter" && changed) run(api.saveAnswer(a.question, draft)) }}
                />
              </label>
              <div className="row">
                <button className="primary mini" disabled={!changed} onClick={() => run(api.saveAnswer(a.question, draft))}>Guardar</button>
                <button className="link small" onClick={() => confirm(`¿Borrar "${a.question}" de la memoria?`) && run(api.removeAnswer(a.question))}>Borrar</button>
              </div>
            </li>
          )
        })}
      </ul>
      <form className="answer-new" onSubmit={(e) => { e.preventDefault(); run(api.saveAnswer(newQ, newA)).then(() => { setNewQ(""); setNewA("") }) }}>
        <input placeholder="Pregunta nueva (p. ej. ¿Tiene certificado de alturas?)" value={newQ} onChange={(e) => setNewQ(e.target.value)} aria-label="Pregunta nueva" />
        <input placeholder="Respuesta" value={newA} onChange={(e) => setNewA(e.target.value)} aria-label="Respuesta" />
        <button className="secondary" disabled={!newQ.trim()}>Agregar</button>
      </form>
      <div className="dialog-actions">
        <button className="primary" onClick={() => ref.current?.close()}>Listo</button>
      </div>
    </dialog>
  )
}

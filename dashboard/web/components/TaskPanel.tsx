import { useEffect, useState } from "react"
import { api, type Task } from "../api"

const STATUS: Record<Task["status"], string> = { queued: "En cola", running: "En curso", done: "Terminada", error: "Error" }
const MODEL: Record<string, string> = { haiku: "Haiku", sonnet: "Sonnet" }

function TaskLog({ id, live }: { id: string; live: boolean }) {
  const [task, setTask] = useState<Task | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => api.task(id).then((t) => alive && setTask(t)).catch(() => {})
    load()
    const timer = live ? setInterval(load, 2000) : undefined
    return () => { alive = false; clearInterval(timer) }
  }, [id, live])
  if (!task) return <p className="muted small">Cargando…</p>
  return <pre className="log" aria-live="polite">{(task.log ?? []).join("\n\n") || "Esperando salida…"}</pre>
}

export function TaskPanel({ tasks, jobTitle }: { tasks: Task[]; jobTitle: (key?: string) => string | null }) {
  const [open, setOpen] = useState<string | null>(null)
  if (tasks.length === 0) return null
  return (
    <section className="tasks" aria-label="Tareas de Claude">
      <h2>Tareas</h2>
      <ul>
        {tasks.map((t) => (
          <li key={t.id} className={`task ${t.status}`}>
            <button className="task-row" aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)}>
              <span className="task-label">{t.label}{jobTitle(t.key) ? ` · ${jobTitle(t.key)}` : ""}</span>
              <span className="badge">{MODEL[t.model] ?? t.model}</span>
              <span className={`status ${t.status}`}>{t.status === "running" && <span className="spinner" aria-hidden="true" />}{STATUS[t.status]}</span>
              {t.cost_usd != null && <span className="muted small">US$ {t.cost_usd.toFixed(3)}</span>}
            </button>
            {open === t.id && <TaskLog id={t.id} live={t.status === "running" || t.status === "queued"} />}
          </li>
        ))}
      </ul>
    </section>
  )
}

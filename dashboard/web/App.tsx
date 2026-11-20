import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { api, type DocKind, type Job, type Task, type TaskInfo } from "./api"
import { AnswersDialog } from "./components/AnswersDialog"
import { ChromeDialog } from "./components/ChromeDialog"
import { DocEditor } from "./components/DocEditor"
import { Inspector, type Tab } from "./components/Inspector"
import { JobTable } from "./components/JobTable"
import { DEFAULT_VIEW, Sidebar, VIEWS, type ViewId } from "./components/Sidebar"
import { Splitter, useStoredSize } from "./components/Splitter"
import { TaskPanel } from "./components/TaskPanel"

interface Toast { id: string; text: string; key?: string; answers?: boolean }

const readFlag = (k: string) => { try { return localStorage.getItem(k) === "1" } catch { return false } }
const writeFlag = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? "1" : "0") } catch {} }

function notify(title: string, body: string) {
  if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) new Notification(title, { body })
}
const askNotifications = () => { if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission() }

export function App({ active, reloadSignal }: { active: boolean; reloadSignal: number }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [taskInfo, setTaskInfo] = useState<TaskInfo[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [view, setView] = useState<ViewId>(DEFAULT_VIEW)
  const [query, setQuery] = useState("")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("resumen")
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [chromeFor, setChromeFor] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [editing, setEditing] = useState<{ key: string; doc: DocKind } | null>(null)
  const [following, setFollowing] = useState(false)
  const [autoCv, setAutoCv] = useState(() => readFlag("auto-cv"))
  const [inspectorW, setInspectorW] = useStoredSize("inspector", 440)
  const jobsRef = useRef<Job[]>([])
  jobsRef.current = jobs

  const toast = (text: string, key?: string, answers = false) => setToasts((t) => [...t, { id: crypto.randomUUID(), text, key, answers }])
  const [answersOpen, setAnswersOpen] = useState(false)
  const [pendingAnswers, setPendingAnswers] = useState(0)
  const [browserUp, setBrowserUp] = useState(false)
  const loadAnswers = useCallback(() => api.answers().then((r) => setPendingAnswers(r.answers.filter((a) => !a.answer.trim()).length)).catch(() => {}), [])

  const loadJobs = useCallback(() => api.jobs().then((d) => {
    setJobs(d.jobs); setStatuses(d.statuses); setTaskInfo(d.tasks)
  }).catch((e) => setError(e.message)), [])

  useEffect(() => { loadJobs(); loadAnswers() }, [loadJobs, loadAnswers])
  // The Buscador marked or unmarked an offer.
  useEffect(() => { if (reloadSignal > 0) loadJobs() }, [reloadSignal, loadJobs])

  // Poll tasks; reload jobs when one finishes and tell the candidate when a CV is ready.
  useEffect(() => {
    const seen = new Map<string, Task["status"]>()
    let first = true
    const tick = () => api.tasks().then(({ tasks }) => {
      setTasks(tasks)
      let changed = false
      for (const t of tasks) {
        const before = seen.get(t.id)
        seen.set(t.id, t.status)
        if (first || before === t.status || (t.status !== "done" && t.status !== "error")) continue
        changed = true
        const title = jobsRef.current.find((j) => j.key === t.key)?.title ?? ""
        if (t.type === "apply" && t.status === "done") {
          toast(`CV y carta listos: ${title}. Revísalos y confírmalos para subirlos.`, t.key)
          notify("CV listo", `${title}: revísalo en el dashboard.`)
        } else if (t.type === "chrome" && t.status === "done") {
          loadAnswers()
          if (t.outcome?.ready) {
            toast(`Postulación lista en Brave: ${title}. Revisa el formulario y pulsa tú el botón de enviar; luego márcala como Aplicada.`, t.key)
            notify("Postulación lista para confirmar", `${title}: revisa Brave y envíala tú.`)
          } else if (t.outcome?.sent) {
            toast(`Postulación enviada: ${title}. Quedó como Aplicada.`, t.key)
            notify("Postulación enviada", title)
          } else if (t.outcome?.newQuestions) {
            toast(`No se envió ${title}: faltan ${t.outcome.newQuestions} respuestas. Respóndelas y vuelve a postular.`, t.key, true)
            notify("Faltan respuestas para postular", title)
          } else {
            toast(`No se envió ${title}: ${t.outcome?.reason || "abre la tarea para ver el motivo"}`, t.key)
          }
        } else if (t.status === "error") {
          toast(`${t.label} falló${title ? `: ${title}` : ""}. Abre la tarea para ver el registro.`, t.key)
        }
      }
      if (changed || first) loadJobs()
      api.browser().then((b) => setBrowserUp(b.running)).catch(() => {})
      first = false
    }).catch(() => {})
    tick()
    const timer = setInterval(tick, 3000)
    return () => clearInterval(timer)
  }, [loadJobs, loadAnswers])

  const visible = useMemo(() => {
    const match = VIEWS.find((v) => v.id === view)!.match
    const q = query.trim().toLowerCase()
    return jobs.filter(match).filter((j) => !q || `${j.title} ${j.company} ${j.location ?? ""}`.toLowerCase().includes(q))
  }, [jobs, view, query])

  const job = jobs.find((j) => j.key === selectedKey) ?? null
  const editJob = editing ? jobs.find((j) => j.key === editing.key) ?? null : null
  const busyKeys = new Set(tasks.filter((t) => t.status === "queued" || t.status === "running").map((t) => t.key))
  const pending = tasks.filter((t) => t.status === "queued" || t.status === "running").length

  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try { await fn(); await loadJobs() } catch (e) { setError((e as Error).message) }
  }
  const run = (type: string, key?: string) => act(async () => setTasks([await api.run(type, key), ...tasks]))

  async function batch(type: "apply" | "critique", keys: string[], what: string) {
    if (keys.length === 0) return setError(`No hay ofertas para ${what}.`)
    const model = taskInfo.find((t) => t.type === type)?.model ?? "sonnet"
    if (!confirm(`${what}: ${keys.length} ${keys.length === 1 ? "oferta" : "ofertas"}.\nSe ejecutan una por una con ${model}; las que ya lo tengan se saltan.\n¿Continuar?`)) return
    askNotifications()
    await act(async () => {
      const r = await api.batch(type, keys)
      const reasons = [...new Set(r.skipped.map((s) => s.reason))].join(", ")
      toast(`${r.queued} en cola${r.skipped.length ? `; ${r.skipped.length} saltadas (${reasons})` : ""}.`)
    })
  }

  const openOffers = (list: Job[]) => list.filter((j) => j.stage !== "cerrada" && j.check?.open !== false)
  const checkedJobs = jobs.filter((j) => checked.has(j.key))

  function check(keys: string[], on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev)
      keys.forEach((k) => (on ? next.add(k) : next.delete(k)))
      return next
    })
  }

  function select(key: string, v: boolean) {
    act(async () => {
      const j = await api.select(key, v)
      if (v && autoCv && !j.application.cv_pdf) {
        askNotifications()
        await api.run("apply", key)
        toast(`Generando CV para ${j.title}. Te aviso cuando esté listo.`)
      }
    })
  }

  // Arrow keys move through the table, like a native list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!active || editing || !["ArrowDown", "ArrowUp"].includes(e.key) || (e.target as HTMLElement).closest("input, select, textarea, dialog, [role=separator], .cm-editor")) return
      e.preventDefault()
      const i = visible.findIndex((j) => j.key === selectedKey)
      const next = visible[Math.max(0, Math.min(visible.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]
      if (next) setSelectedKey(next.key)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [visible, selectedKey, editing, active])

  const model = (type: string) => taskInfo.find((t) => t.type === type)?.model

  return (
    <div className="app" style={active ? undefined : { display: "none" }}>
      <header className="toolbar">
        <div className="toolbar-actions">
          <button className="secondary" onClick={() => run("scrape")} title={`Modelo: ${model("scrape")}`}>Buscar ofertas</button>
          <button className="secondary" onClick={() => run("rank")} title={`Modelo: ${model("rank")}`}>Puntuar nuevas</button>
          <button className="secondary" onClick={() => batch("critique", openOffers(visible).map((j) => j.key), "Estimar probabilidad de las ofertas de esta vista")} title={`Modelo: ${model("critique")}`}>
            Probabilidad de todas
          </button>
          <button className="secondary" onClick={() => batch("apply", openOffers(jobs.filter((j) => j.selected && !j.application.cv_pdf)).map((j) => j.key), "Generar CV y carta de las seguidas sin CV")} title={`Modelo: ${model("apply")}`}>
            CVs de seguidas
          </button>
          <button className="secondary" disabled={following} onClick={() => act(async () => { setFollowing(true); try { await api.followUp() } finally { setFollowing(false) } })}>
            {following ? "Revisando…" : "Revisar seguidas"}
          </button>
          <button
            className="secondary"
            title={browserUp ? "Brave conectado: abre Computrabajo" : "Activa la depuración remota de Brave (una vez) para postular con tu sesión"}
            onClick={() => act(() => api.openBrowser(browserUp ? "https://co.computrabajo.com/" : undefined))}
          >
            <span className={`dot ${browserUp ? "on" : ""}`} aria-hidden="true" />{browserUp ? "Brave conectado" : "Conectar Brave"}
          </button>
          <button className="secondary" onClick={() => setAnswersOpen(true)}>
            Respuestas{pendingAnswers > 0 && <span className="tag">{pendingAnswers} por responder</span>}
          </button>
          <label className="toggle" title="Al marcar Seguir en una oferta sin CV, se genera solo y te aviso cuando esté listo">
            <input type="checkbox" checked={autoCv} onChange={(e) => { setAutoCv(e.target.checked); writeFlag("auto-cv", e.target.checked); if (e.target.checked) askNotifications() }} />
            CV automático al seguir
          </label>
          <input type="search" className="search" placeholder="Buscar por cargo, empresa o ciudad" aria-label="Buscar ofertas" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </header>

      {error && <div className="banner" role="alert">{error}<button className="link" onClick={() => setError(null)}>Cerrar</button></div>}

      {editJob && editing ? (
        <DocEditor job={editJob} doc={editing.doc} onDoc={(doc) => setEditing({ ...editing, doc })} onClose={() => setEditing(null)} onSaved={loadJobs} />
      ) : (
      <div className="split" style={{ "--inspector-w": `${inspectorW}px` } as React.CSSProperties}>
        <Sidebar jobs={jobs} view={view} onView={setView} />
        <main className="content">
          {checked.size > 0 && (
            <div className="batchbar" role="toolbar" aria-label="Acciones para las ofertas elegidas">
              <strong>{checked.size} {checked.size === 1 ? "elegida" : "elegidas"}</strong>
              <button className="secondary" onClick={() => batch("critique", openOffers(checkedJobs).map((j) => j.key), "Estimar probabilidad de las elegidas")}>Estimar probabilidad</button>
              <button className="primary" onClick={() => batch("apply", openOffers(checkedJobs).map((j) => j.key), "Generar CVs personalizados de las elegidas")}>Generar CVs en masa</button>
              <button className="secondary" onClick={() => act(async () => { for (const j of checkedJobs) await api.select(j.key, true) })}>Seguir todas</button>
              <button className="link" onClick={() => setChecked(new Set())}>Quitar selección</button>
            </div>
          )}
          <JobTable
            jobs={visible}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            checked={checked}
            onCheck={check}
            onPreview={(k) => { setSelectedKey(k); setTab("docs") }}
          />
          <TaskPanel tasks={tasks} jobTitle={(k) => (k ? jobs.find((j) => j.key === k)?.title ?? null : null)} />
        </main>
        <Splitter label="Ancho del detalle" size={inspectorW} min={320} max={Math.max(360, window.innerWidth - 520)} direction={-1} onSize={setInspectorW} />
        {job ? (
          <Inspector
            key={job.key}
            job={job}
            statuses={statuses}
            busy={busyKeys.has(job.key)}
            tab={tab}
            onTab={setTab}
            onSelect={(v) => select(job.key, v)}
            onConfirmCv={(v) => act(() => api.confirmCv(job.key, v))}
            onStatus={(s) => act(() => api.status(job.key, s))}
            onRun={(type) => run(type, job.key)}
            onFollowUp={() => act(() => api.followUp(job.key))}
            onChrome={() => setChromeFor(job)}
            onEdit={(doc) => setEditing({ key: job.key, doc })}
            onClose={() => setSelectedKey(null)}
          />
        ) : (
          <aside className="inspector empty"><p className="muted">Elige una oferta para ver su detalle.</p></aside>
        )}
      </div>
      )}

      {pending > 0 && <span className="sr-only" aria-live="polite">{pending} tareas pendientes</span>}
      <ol className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <li key={t.id} className="toast">
            <span>{t.text}</span>
            {t.answers && <button className="link" onClick={() => { setAnswersOpen(true); setToasts((x) => x.filter((y) => y.id !== t.id)) }}>Responder</button>}
            {t.key && <button className="link" onClick={() => { setEditing(null); setSelectedKey(t.key!); setTab("docs"); setToasts((x) => x.filter((y) => y.id !== t.id)) }}>Ver</button>}
            <button className="link" aria-label="Cerrar aviso" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>✕</button>
          </li>
        ))}
      </ol>

      {answersOpen && <AnswersDialog onClose={() => setAnswersOpen(false)} onChange={setPendingAnswers} />}

      {chromeFor && (
        <ChromeDialog
          job={chromeFor}
          onCancel={() => setChromeFor(null)}
          onConfirm={() => { const k = chromeFor.key; setChromeFor(null); run("chrome", k) }}
        />
      )}
    </div>
  )
}

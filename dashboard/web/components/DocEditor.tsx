import { useEffect, useMemo, useRef, useState } from "react"
import { api, type CompileResult, type DocKind, type Job } from "../api"
import { LatexCode, type LatexCodeHandle } from "./LatexCode"
import { Splitter, useStoredSize } from "./Splitter"
import { SheetDesk, useSheetZoom, ZoomControl } from "./SheetView"
import { OfferDetails } from "./OfferDetails"

interface Props {
  job: Job
  doc: DocKind
  onDoc: (d: DocKind) => void
  onClose: () => void
  onSaved: () => void
}

export interface OutlineItem { line: number; label: string; level: 1 | 2 }

/** Sections and job entries, so long files can be navigated by what they contain. */
export function outlineOf(src: string): OutlineItem[] {
  const out: OutlineItem[] = []
  src.split("\n").forEach((l, i) => {
    if (/^\s*%/.test(l)) return
    const s = l.match(/\\section\*?\{([^}]*)\}/)
    if (s) return void out.push({ line: i + 1, label: s[1], level: 1 })
    const c = l.match(/\\(?:cargo|cventry)\{([^}]*)\}\{([^}]*)\}/)
    if (c) out.push({ line: i + 1, label: `${c[1] || c[2]} · ${c[1] ? c[2] : ""}`.replace(/ · $/, ""), level: 2 })
  })
  return out
}

export const SNIPPETS: { label: string; title: string; run: (e: LatexCodeHandle) => void }[] = [
  { label: "N", title: "Negrita", run: (e) => e.wrap("\\textbf{", "}") },
  { label: "K", title: "Cursiva", run: (e) => e.wrap("\\textit{", "}") },
  { label: "• Viñeta", title: "Nueva viñeta debajo", run: (e) => e.insertLine("  \\item ") },
  { label: "+ Cargo", title: "Nuevo cargo con viñetas", run: (e) => e.insertLine("\\cargo{Cargo}{Empresa}{Ciudad}{MM/AAAA -- MM/AAAA}\n\\begin{itemize}\n  \\item \n\\end{itemize}") },
  { label: "+ Sección", title: "Nueva sección", run: (e) => e.insertLine("\\section{Título}") },
]

/** Full-window LaTeX editor: the offer's requirements on top; outline, highlighted source and the compiled sheet side by side. */
export function DocEditor({ job, doc, onDoc, onClose, onSaved }: Props) {
  const [path, setPath] = useState("")
  const [loaded, setLoaded] = useState("")
  const [source, setSource] = useState("")
  const [saved, setSaved] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [compiling, setCompiling] = useState(false)
  const [result, setResult] = useState<CompileResult | null>(null)
  const [stamp, setStamp] = useState(Date.now())
  const [codeW, setCodeW] = useStoredSize("editor-code", 560)
  const [view, setView] = useState<"hoja" | "latex">("hoja")
  const [zoom, setZoom] = useSheetZoom()
  const editor = useRef<LatexCodeHandle>(null)
  const dirty = source !== saved
  const pdf = result?.pdf ?? (doc === "cv" ? job.application.cv_pdf : job.application.cover_pdf)
  const outline = useMemo(() => outlineOf(source), [source])

  useEffect(() => {
    setResult(null)
    setLoadError(null)
    api.tex(job.key, doc)
      .then((r) => { setPath(r.path); setLoaded(r.content); setSource(r.content); setSaved(r.content) })
      .catch((e) => setLoadError(String(e.message ?? e)))
  }, [job.key, doc])

  // Leaving with unsaved edits asks first, including closing the tab.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const compileRef = useRef<() => void>(() => {})
  async function compile() {
    if (compiling) return
    setCompiling(true)
    const text = source
    try {
      const r = await api.saveTex(job.key, doc, text)
      setSaved(text)
      setResult(r)
      setStamp(Date.now())
      onSaved()
    } catch (e) {
      setResult({ ok: false, pages: null, pageLimit: 1, errors: [String((e as Error).message ?? e)], pdf: null })
    } finally {
      setCompiling(false)
    }
  }
  compileRef.current = compile

  const leave = (then: () => void) => { if (!dirty || confirm("Hay cambios sin compilar. ¿Descartarlos?")) then() }

  const over = result?.ok && result.pages != null && result.pages > result.pageLimit
  const status = result == null ? null
    : !result.ok ? { tone: "error", text: "No compiló. El PDF anterior se mantiene." }
    : result.pages === result.pageLimit ? { tone: "ok", text: `Compilado: ${result.pages} ${result.pages === 1 ? "página" : "páginas"}, dentro del límite.` }
    : { tone: "warn", text: `Compilado con ${result.pages ?? "?"} páginas; el formato pide exactamente ${result.pageLimit}.` }

  return (
    <section className="editor" aria-label={`Editar ${doc === "cv" ? "CV" : "carta"} de ${job.company}`}>
      <header className="editor-bar">
        <button className="secondary" onClick={() => leave(onClose)}>‹ Volver</button>
        <div className="editor-title">
          <strong>{job.title} · {job.company}</strong>
          <span className="muted small">{path || "…"}{dirty ? " · cambios sin compilar" : ""}</span>
        </div>
        <div className="segmented" role="tablist" aria-label="Documento">
          <button role="tab" aria-selected={doc === "cv"} className={doc === "cv" ? "on" : ""} onClick={() => doc !== "cv" && leave(() => onDoc("cv"))}>CV</button>
          <button role="tab" aria-selected={doc === "cover"} disabled={!job.application.cover_tex} className={doc === "cover" ? "on" : ""} onClick={() => doc !== "cover" && leave(() => onDoc("cover"))}>Carta</button>
        </div>
        <button className="primary" disabled={compiling || !!loadError} onClick={compile}>
          {compiling ? <><span className="spinner" aria-hidden="true" />Compilando…</> : "Guardar y compilar"}
        </button>
      </header>

      <OfferDetails job={job} />

      <div className="editor-tools" role="toolbar" aria-label="Formato">
        {SNIPPETS.map((s) => (
          <button key={s.title} className="secondary" title={s.title} aria-label={s.title} onClick={() => editor.current && s.run(editor.current)}>{s.label}</button>
        ))}
        <span className="muted small">Ctrl+S compila · Ctrl+F busca · Ctrl+Z deshace</span>
        {status && <span className={`pill ${status.tone}`} role="status">{status.text}</span>}
      </div>

      {result && !result.ok && (
        <ul className="editor-errors" aria-label="Errores de LaTeX">
          {result.errors.map((e) => {
            const line = e.match(/\(línea (\d+)\)/)
            return <li key={e}>{line ? <button className="link" onClick={() => editor.current?.goToLine(Number(line[1]))}>{e}</button> : e}</li>
          })}
        </ul>
      )}
      {over && <p className="editor-tip">Para volver a {result!.pageLimit} página: acorta viñetas largas, quita la certificación menos relevante o reduce el perfil a 3 líneas.</p>}

      <div className="editor-panes" style={{ gridTemplateColumns: `170px ${codeW}px 8px minmax(240px, 1fr)` }}>
        <nav className="outline" aria-label="Índice del documento">
          <p className="sidebar-title">Índice</p>
          <ul>
            {outline.map((o) => (
              <li key={o.line} className={o.level === 2 ? "sub" : ""}>
                <button onClick={() => editor.current?.goToLine(o.line)} title={`Línea ${o.line}`}>{o.label}</button>
              </li>
            ))}
            {outline.length === 0 && <li className="muted small">Sin secciones</li>}
          </ul>
        </nav>
        {loadError
          ? <p className="empty muted">{loadError}</p>
          : <LatexCode ref={editor} value={loaded} onChange={setSource} onSave={() => compileRef.current()} />}
        <Splitter label="Ancho del código" size={codeW} min={280} max={Math.max(320, window.innerWidth - 480)} direction={1} onSize={setCodeW} />
        <aside className="tpl-view" aria-label={doc === "cv" ? "Hoja del CV" : "Hoja de la carta"}>
          <div className="tpl-view-head">
            <div className="segmented" role="tablist" aria-label="Vista">
              <button role="tab" aria-selected={view === "hoja"} className={view === "hoja" ? "on" : ""} onClick={() => setView("hoja")}>Hoja</button>
              <button role="tab" aria-selected={view === "latex"} className={view === "latex" ? "on" : ""} onClick={() => setView("latex")}>LaTeX guardado</button>
            </div>
            {view === "hoja" && <ZoomControl zoom={zoom} onZoom={setZoom} />}
          </div>
          <div className="tpl-view-body">
            {view === "hoja"
              ? <SheetDesk pdf={pdf} stamp={stamp} zoom={zoom} working={compiling} label={doc === "cv" ? "el CV" : "la carta"} empty="Aún no hay PDF. Compila para verlo." />
              : <LatexCode key={`${doc}-${stamp}-${saved.length}`} value={saved} readOnly label="LaTeX guardado" />}
          </div>
        </aside>
      </div>
    </section>
  )
}

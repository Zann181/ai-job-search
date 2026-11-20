// Plantillas tab: the role templates of cv/plantillas/, each its own file. Left: the CV photo,
// .tex import and the template picker with the outline of the chosen one. Middle: the LaTeX
// editor. Right corner: what the template says, as the rendered sheet, the saved LaTeX, or a
// summary card. Both side panels resize and collapse; .tex files and photos can be dropped in.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { api, photoUrl, type CompileResult, type PhotoInfo, type TemplateInfo } from "../api"
import { LatexCode, type LatexCodeHandle } from "./LatexCode"
import { outlineOf, SNIPPETS } from "./DocEditor"
import { Splitter, useStoredSize } from "./Splitter"
import { SheetDesk, useSheetZoom, ZoomControl } from "./SheetView"

type View = "hoja" | "latex" | "ficha"

const VIEWS: { id: View; label: string }[] = [
  { id: "hoja", label: "Hoja" },
  { id: "latex", label: "LaTeX guardado" },
  { id: "ficha", label: "Ficha" },
]

const load = (k: string, fallback: string) => { try { return localStorage.getItem(k) ?? fallback } catch { return fallback } }
const store = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private window */ } }

/** Any image the browser can open, re-encoded as JPEG (what the templates include), upright and at most 1000 px. */
async function toJpegBase64(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1000 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error("No se pudo convertir la imagen."))), "image/jpeg", 0.92))
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

const isTex = (f: File) => /\.tex$/i.test(f.name)
const isImage = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(f.name)

export function TemplateEditor({ active }: { active: boolean }) {
  const [list, setList] = useState<TemplateInfo[]>([])
  const [photo, setPhoto] = useState<PhotoInfo | null>(null)
  const [id, setId] = useState(() => load("tpl:id", ""))
  const [path, setPath] = useState("")
  const [loaded, setLoaded] = useState("")
  const [source, setSource] = useState("")
  const [saved, setSaved] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<"save" | "preview" | "import" | "photo" | null>(null)
  const [result, setResult] = useState<CompileResult | null>(null)
  const [stamp, setStamp] = useState(Date.now())
  const [rev, setRev] = useState(0)
  const [view, setView] = useState<View>(() => { const v = load("tpl:view", "hoja"); return (VIEWS.some((x) => x.id === v) ? v : "hoja") as View })
  const [zoom, setZoom] = useSheetZoom()
  const [leftOpen, setLeftOpen] = useState(() => load("tpl:left", "1") === "1")
  const [rightOpen, setRightOpen] = useState(() => load("tpl:right", "1") === "1")
  const [leftW, setLeftW] = useStoredSize("tpl-left", 270)
  const [rightW, setRightW] = useStoredSize("tpl-right", 520)
  const [dropping, setDropping] = useState(false)
  const editor = useRef<LatexCodeHandle>(null)
  const texInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const dirty = source !== saved
  const info = list.find((t) => t.id === id) ?? null
  const outline = useMemo(() => outlineOf(source), [source])
  const confirms = useMemo(() => source.split("\n").flatMap((l, i) => (/%\s*CONFIRMAR/.test(l) ? [i + 1] : [])), [source])

  const replace = (t: TemplateInfo) => setList((l) => (l.some((x) => x.id === t.id) ? l.map((x) => (x.id === t.id ? t : x)) : [...l, t].sort((a, b) => a.id.localeCompare(b.id))))
  const fail = (e: unknown) => setError((e as Error).message ?? String(e))

  const refresh = useCallback(() => api.templates().then((r) => { setList(r.templates); setPhoto(r.photo); return r.templates }), [])

  const preview = useCallback(async (tid: string) => {
    setBusy("preview")
    try {
      const r = await api.compileTemplate(tid)
      replace(r.info); setResult(r.result); setStamp(Date.now())
    } catch (e) { fail(e) } finally { setBusy(null) }
  }, [])

  useEffect(() => {
    refresh().then((l) => { if (!l.some((t) => t.id === id) && l[0]) setId(l[0].id) }).catch(fail)
  }, [])

  // Load the chosen template; build its sheet once if it was never compiled.
  useEffect(() => {
    if (!id) return
    store("tpl:id", id)
    setResult(null); setError(null)
    api.template(id).then((r) => {
      setPath(r.path); setLoaded(r.content); setSource(r.content); setSaved(r.content); setRev((n) => n + 1)
    }).catch(fail)
  }, [id])
  useEffect(() => { if (info && !info.pdf && busy == null) void preview(info.id) }, [info?.id, info?.pdf])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const choose = (next: string) => {
    if (next === id) return
    if (dirty && !confirm("Hay cambios sin guardar en esta plantilla. ¿Descartarlos?")) return
    setId(next)
  }

  const saveRef = useRef<() => void>(() => {})
  async function save() {
    if (busy || !id) return
    setBusy("save"); setError(null)
    const text = source
    try {
      const r = await api.saveTemplate(id, text)
      setSaved(text); replace(r.info); setResult(r.result); setStamp(Date.now())
    } catch (e) { fail(e) } finally { setBusy(null) }
  }
  saveRef.current = save

  async function importTex(file: File) {
    if (dirty && !confirm("Hay cambios sin guardar en esta plantilla. ¿Descartarlos e importar?")) return
    setBusy("import"); setError(null); setNotice(null)
    try {
      const content = await file.text()
      let r = await api.importTemplate(file.name, content)
      if (r.exists) {
        if (!confirm(`Ya existe la plantilla «${r.id}». ¿Reemplazarla con ${file.name}?`)) return
        r = await api.importTemplate(file.name, content, true)
      }
      if (r.exists) return
      replace(r.info); setResult(r.result); setStamp(Date.now())
      setNotice(`Importada como cv/plantillas/hoja_de_vida_${r.id}.tex${r.result.ok ? "" : " (no compiló: revisa los errores)"}.`)
      if (r.id === id) { const t = await api.template(id); setLoaded(t.content); setSource(t.content); setSaved(t.content); setRev((n) => n + 1) }
      else setId(r.id)
    } catch (e) { fail(e) } finally { setBusy(null) }
  }

  async function uploadPhoto(file: File) {
    setBusy("photo"); setError(null); setNotice(null)
    try {
      const p = await api.savePhoto(await toJpegBase64(file))
      setPhoto(p); setStamp(Date.now())
      setNotice("Foto actualizada. La anterior quedó como Foto_perfil.anterior.jpeg.")
    } catch (e) { fail(e) } finally { setBusy(null) }
    if (id) await preview(id)
  }

  function onFiles(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    if (isTex(f)) void importTex(f)
    else if (isImage(f)) void uploadPhoto(f)
    else setError(`«${f.name}» no es un .tex ni una imagen.`)
  }

  const toggle = (side: "left" | "right") => {
    if (side === "left") setLeftOpen((v) => { store("tpl:left", v ? "0" : "1"); return !v })
    else setRightOpen((v) => { store("tpl:right", v ? "0" : "1"); return !v })
  }
  const pick = (v: View) => { setView(v); store("tpl:view", v); if (!rightOpen) toggle("right") }

  const status = busy === "save" || busy === "preview" ? { tone: "busy", text: "Compilando…" }
    : result == null ? (info?.pages != null ? { tone: info.pages === 1 ? "ok" : "warn", text: `${info.pages} ${info.pages === 1 ? "página" : "páginas"}` } : null)
    : !result.ok ? { tone: "error", text: "No compiló; se mantiene la hoja anterior" }
    : result.pages === result.pageLimit ? { tone: "ok", text: "1 página · dentro del límite" }
    : { tone: "warn", text: `${result.pages ?? "?"} páginas · debe ser 1` }

  const cols = [
    leftOpen ? `min(${leftW}px, 30vw) 8px` : "36px",
    "minmax(0, 1fr)",
    rightOpen ? `8px min(${rightW}px, 48vw)` : "36px",
  ].join(" ")

  return (
    <section className="tpl" style={active ? undefined : { display: "none" }} aria-label="Plantillas de hoja de vida">
      <header className="tpl-bar">
        <div className="tpl-title">
          <span className="tpl-eyebrow">Plantilla</span>
          <strong>{info ? info.role : "Plantillas"}</strong>
          <span className="muted small">{path || "cv/plantillas/"}{dirty && <span className="tpl-dirty"> · sin guardar</span>}</span>
        </div>
        {status && <span className={`tpl-status ${status.tone}`} role="status">{status.tone === "busy" && <span className="spinner" aria-hidden="true" />}{status.text}</span>}
        <div className="tpl-bar-actions">
          <button className="secondary" disabled={!dirty || !!busy} onClick={() => { setLoaded(saved); setSource(saved); setRev((n) => n + 1) }}>Descartar</button>
          <button className="primary" disabled={!!busy || !id} onClick={save}>{busy === "save" ? "Compilando…" : "Guardar y compilar"}</button>
        </div>
      </header>

      <div className="tpl-tools" role="toolbar" aria-label="Formato">
        {SNIPPETS.map((s) => (
          <button key={s.title} className="tpl-tool" title={s.title} aria-label={s.title} onClick={() => editor.current && s.run(editor.current)}>{s.label}</button>
        ))}
        {confirms.length > 0 && <span className="tpl-sep" aria-hidden="true" />}
        {confirms.map((line) => (
          <button key={line} className="tpl-flag" title="Afirmación sin verificar: no la promociones al titular ni al perfil" onClick={() => editor.current?.goToLine(line)}>Por confirmar · línea {line}</button>
        ))}
        <span className="muted small tpl-hint">Ctrl+S guarda · Ctrl+F busca · anexos apagados</span>
      </div>

      {error && <div className="banner" role="alert">{error}<button className="link" onClick={() => setError(null)}>Cerrar</button></div>}
      {notice && !error && <div className="tpl-notice" role="status">{notice}<button className="link" onClick={() => setNotice(null)}>Cerrar</button></div>}
      {result && !result.ok && (
        <ul className="editor-errors" aria-label="Errores de LaTeX">
          {result.errors.map((e) => {
            const line = e.match(/\(línea (\d+)\)/)
            return <li key={e}>{line ? <button className="link" onClick={() => editor.current?.goToLine(Number(line[1]))}>{e}</button> : e}</li>
          })}
        </ul>
      )}

      <input ref={texInput} type="file" accept=".tex,text/x-tex,application/x-tex" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = "" }} />
      <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = "" }} />

      <div className="tpl-panes" style={{ gridTemplateColumns: cols }}>
        {leftOpen ? (
          <aside
            className={`tpl-side ${dropping ? "dropping" : ""}`}
            aria-label="Plantillas"
            onDragOver={(e) => { e.preventDefault(); setDropping(true) }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false) }}
            onDrop={(e) => { e.preventDefault(); setDropping(false); onFiles(e.dataTransfer.files) }}
          >
            <div className="tpl-side-head">
              <p className="tpl-label">Foto del currículum</p>
              <button className="icon" aria-label="Ocultar panel de plantillas" title="Ocultar" onClick={() => toggle("left")}>‹</button>
            </div>
            <div className="tpl-photo">
              {photo?.exists
                ? <img src={photoUrl(photo.updated ?? stamp)} alt="Foto actual del currículum" />
                : <span className="tpl-photo-empty" aria-hidden="true">?</span>}
              <div>
                <p className="small">{photo?.exists ? "Foto_perfil.jpeg" : "Sin foto"}</p>
                <p className="muted small">La usan todas las plantillas</p>
                <button className="secondary mini" disabled={!!busy} onClick={() => photoInput.current?.click()}>{busy === "photo" ? "Subiendo…" : "Cambiar foto"}</button>
              </div>
            </div>

            <div className="tpl-side-head">
              <p className="tpl-label">Plantillas <span className="count">{list.length}</span></p>
              <button className="secondary mini" disabled={!!busy} onClick={() => texInput.current?.click()}>{busy === "import" ? "Importando…" : "+ Importar .tex"}</button>
            </div>
            <ul className="tpl-list">
              {list.map((t) => (
                <li key={t.id}>
                  <button className={t.id === id ? "active" : ""} aria-current={t.id === id ? "true" : undefined} onClick={() => choose(t.id)}>
                    <span className="tpl-mono" aria-hidden="true">{t.role.trim().charAt(0).toUpperCase()}</span>
                    <span className="tpl-card">
                      <strong>{t.role}</strong>
                      <span className="muted small">{t.headline}</span>
                      <span className="tpl-badges">
                        {t.pages != null && <span className={`badge ${t.pages === 1 ? "ok" : "bad"}`}>{t.pages === 1 ? "1 pág." : `${t.pages} págs.`}</span>}
                        {t.confirm.length > 0 && <span className="badge bad">{t.confirm.length} por confirmar</span>}
                        {t.anexos && <span className="badge bad">anexos activos</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {list.length === 0 && <li className="muted small">No hay plantillas en cv/plantillas/.</li>}
            </ul>
            <p className="tpl-drop-hint muted small">Arrastra aquí un .tex para importarlo o una imagen para cambiar la foto.</p>

            <details className="tpl-outline" open>
              <summary className="tpl-label">Índice</summary>
              <ul className="outline-list">
                {outline.map((o) => (
                  <li key={o.line} className={o.level === 2 ? "sub" : ""}>
                    <button onClick={() => editor.current?.goToLine(o.line)} title={`Línea ${o.line}`}>{o.label}</button>
                  </li>
                ))}
              </ul>
            </details>
            {dropping && <div className="tpl-dropzone" aria-hidden="true">Suelta el .tex o la foto</div>}
          </aside>
        ) : (
          <button className="rail" aria-label="Mostrar panel de plantillas" title="Plantillas" onClick={() => toggle("left")}>›</button>
        )}
        {leftOpen && <Splitter label="Ancho del panel de plantillas" size={leftW} min={200} max={440} direction={1} onSize={setLeftW} />}

        <div className="tpl-code">
          {id ? <LatexCode key={`${id}-${rev}`} ref={editor} value={loaded} onChange={setSource} onSave={() => saveRef.current()} label="Editor LaTeX de la plantilla" /> : <p className="empty muted">Elige o importa una plantilla.</p>}
        </div>

        {rightOpen && <Splitter label="Ancho de la vista de la plantilla" size={rightW} min={300} max={Math.max(340, window.innerWidth - 560)} direction={-1} onSize={setRightW} />}
        {rightOpen ? (
          <aside className="tpl-view" aria-label="Lo que dice la plantilla">
            <div className="tpl-view-head">
              <div className="segmented" role="tablist" aria-label="Vista">
                {VIEWS.map((v) => (
                  <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? "on" : ""} onClick={() => pick(v.id)}>{v.label}</button>
                ))}
              </div>
              {view === "hoja" && (
                <ZoomControl zoom={zoom} onZoom={setZoom} />
              )}
              <button className="icon" aria-label="Ocultar vista de la plantilla" title="Ocultar" onClick={() => toggle("right")}>›</button>
            </div>
            <div className="tpl-view-body">
              {view === "hoja" && (
                <SheetDesk pdf={info?.pdf ?? null} stamp={`${info?.updated}-${stamp}`} zoom={zoom} working={busy === "save" || busy === "preview"} label={info?.role ?? "la plantilla"} />
              )}
              {view === "latex" && <LatexCode key={`${id}-${stamp}`} value={saved} readOnly label="LaTeX guardado de la plantilla" />}
              {view === "ficha" && info && (
                <div className="tpl-ficha">
                  <h2>{info.role}</h2>
                  <dl>
                    <dt>Titular</dt><dd>{info.headline}</dd>
                    <dt>Enfoque</dt><dd>{info.subject}</dd>
                    <dt>Archivo</dt><dd className="muted">{info.path} · guardada {new Date(info.updated).toLocaleString()}</dd>
                  </dl>
                  <h3>Palabras clave del PDF <span className="count">{info.keywords.length}</span></h3>
                  <div className="tpl-chips">{info.keywords.map((k) => <span key={k} className="tpl-chip">{k}</span>)}</div>
                  <h3>Por confirmar</h3>
                  {info.confirm.length === 0
                    ? <p className="muted">Ninguna afirmación pendiente.</p>
                    : <ul>{info.confirm.map((c) => <li key={c.line}><button className="link" onClick={() => editor.current?.goToLine(c.line)}>Línea {c.line}</button>: {c.text}</li>)}</ul>}
                  <h3>Anexos</h3>
                  <p className={info.anexos ? "bs-err" : "muted"}>{info.anexos ? "Activos: apágalos (\\anexosfalse) antes de guardar." : "Apagados (\\anexosfalse). No se activan hasta tener el certificado corregido."}</p>
                  <h3>Adaptar a una oferta</h3>
                  <p className="muted">Pídele a Claude Code <code>/adaptar-plantilla</code> con la URL o el texto de la oferta: elige la plantilla, crea <code>cv/main_&lt;empresa&gt;_&lt;rol&gt;.tex</code> y nunca modifica esta.</p>
                </div>
              )}
            </div>
          </aside>
        ) : (
          <button className="rail" aria-label="Mostrar vista de la plantilla" title="Vista" onClick={() => toggle("right")}>‹</button>
        )}
      </div>
    </section>
  )
}

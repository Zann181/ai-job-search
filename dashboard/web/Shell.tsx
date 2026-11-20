// Main menu: one window, three sections (Plantillas, Buscador, Ofertas). Every section stays mounted (only hidden)
// so a search in progress and its results survive a visit to the other tabs.
import { useEffect, useState } from "react"
import { STALE_EVENT } from "./api"
import { App } from "./App"
import { Buscador } from "./components/Buscador"
import { TemplateEditor } from "./components/TemplateEditor"

type Section = "plantillas" | "buscador" | "ofertas"

const SECTIONS: { id: Section; label: string; hint: string }[] = [
  { id: "plantillas", label: "Plantillas", hint: "Tus plantillas de hoja de vida por rol: elige, lee y edita su LaTeX" },
  { id: "buscador", label: "Buscador", hint: "Busca en los portales y puntúa según tu CV" },
  { id: "ofertas", label: "Ofertas", hint: "Ofertas puntuadas, por postular, con CV y en proceso" },
]

const read = (): Section => {
  try {
    const v = localStorage.getItem("section")
    return SECTIONS.some((s) => s.id === v) ? (v as Section) : "plantillas"
  } catch { return "plantillas" }
}

export function Shell() {
  const [section, setSection] = useState<Section>(read)
  const [reload, setReload] = useState(0)
  const [stale, setStale] = useState(false)
  useEffect(() => {
    const on = () => setStale(true)
    window.addEventListener(STALE_EVENT, on)
    return () => window.removeEventListener(STALE_EVENT, on)
  }, [])
  const go = (s: Section) => { setSection(s); try { localStorage.setItem("section", s) } catch { /* private window */ } }

  return (
    <div className="shell">
      {stale && (
        <div className="banner" role="alert">
          <span>El servidor del dashboard se reinició y esta pestaña tiene la sesión anterior, así que no puede leer ni guardar. Recarga la página; si estabas editando LaTeX sin guardar, cópialo antes.</span>
          <button className="secondary" onClick={() => location.reload()}>Recargar</button>
        </div>
      )}
      <nav className="mainmenu" aria-label="Menú principal">
        <h1>Búsqueda de empleo</h1>
        <ul>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button className={section === s.id ? "active" : ""} aria-current={section === s.id ? "page" : undefined} title={s.hint} onClick={() => go(s.id)}>{s.label}</button>
            </li>
          ))}
        </ul>
      </nav>
      <TemplateEditor active={section === "plantillas"} />
      <div className="section" style={section === "buscador" ? undefined : { display: "none" }}>
        <Buscador onMarked={() => setReload((n) => n + 1)} />
      </div>
      <App active={section === "ofertas"} reloadSignal={reload} />
    </div>
  )
}

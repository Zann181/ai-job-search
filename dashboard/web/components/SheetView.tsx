// The compiled sheet as page images (pdftoppm on the server), never the browser's PDF
// viewer. Shared by Plantillas, the CV/cover editor and the Documentos tab.
import { useEffect, useState } from "react"
import { api, sheetUrl, type SheetSet } from "../api"

export type Zoom = "ajustar" | "real"

const KEY = "sheet:zoom"
const readZoom = (): Zoom => { try { return localStorage.getItem(KEY) === "real" ? "real" : "ajustar" } catch { return "ajustar" } }

/** Fit-to-pane or 100 %, remembered across views. */
export function useSheetZoom(): [Zoom, (z: Zoom) => void] {
  const [zoom, setZoom] = useState<Zoom>(readZoom)
  return [zoom, (z) => { setZoom(z); try { localStorage.setItem(KEY, z) } catch { /* private window */ } }]
}

export function ZoomControl({ zoom, onZoom }: { zoom: Zoom; onZoom: (z: Zoom) => void }) {
  return (
    <div className="segmented tpl-zoom" aria-label="Tamaño de la hoja">
      <button className={zoom === "ajustar" ? "on" : ""} aria-pressed={zoom === "ajustar"} onClick={() => onZoom("ajustar")}>Ajustar</button>
      <button className={zoom === "real" ? "on" : ""} aria-pressed={zoom === "real"} onClick={() => onZoom("real")}>100 %</button>
    </div>
  )
}

interface Props {
  /** PDF path relative to the repo (cv/… or cover_letters/…), or null when not compiled yet. */
  pdf: string | null
  /** Changes after each compile, so the images are fetched again. */
  stamp: number | string
  zoom: Zoom
  working?: boolean
  label: string
  empty?: string
}

export function SheetDesk({ pdf, stamp, zoom, working, label, empty }: Props) {
  const [set, setSet] = useState<SheetSet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!pdf) { setSet(null); setError(null); return }
    let live = true
    setLoading(true); setError(null)
    api.sheets(pdf)
      .then((s) => { if (live) setSet(s) })
      .catch((e) => { if (live) { setSet(null); setError((e as Error).message ?? String(e)) } })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [pdf, stamp])

  const pages = set ? Array.from({ length: set.pages }, (_, i) => i + 1) : []
  return (
    <div className={`tpl-desk ${zoom} ${working || loading ? "working" : ""}`}>
      {pages.length > 0
        ? pages.map((n) => <img key={`${n}-${set!.stamp}`} className="tpl-sheet" src={sheetUrl(set!.pdf, n, set!.stamp)} alt={`Hoja ${n} de ${label}`} />)
        : <p className="empty muted">{error ?? (working || loading ? "Dibujando la hoja…" : empty ?? "Aún no hay hoja compilada.")}</p>}
    </div>
  )
}

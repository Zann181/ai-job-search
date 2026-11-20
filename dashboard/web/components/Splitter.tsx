import { useEffect, useState } from "react"

/** Size in px persisted per splitter; per-viewer convenience, so localStorage. */
export function useStoredSize(id: string, initial: number) {
  const [size, setSize] = useState(() => {
    try { return Number(localStorage.getItem(`split:${id}`)) || initial } catch { return initial }
  })
  useEffect(() => { try { localStorage.setItem(`split:${id}`, String(Math.round(size))) } catch {} }, [id, size])
  return [size, setSize] as const
}

interface Props {
  label: string
  /** Current size of the pane the splitter resizes. */
  size: number
  min: number
  max: number
  /** +1 when dragging right grows the pane (pane on the left), -1 when it shrinks it. */
  direction: 1 | -1
  onSize: (px: number) => void
}

/** Vertical bar between two panes: drag with the mouse, or focus and use the arrow keys. */
export function Splitter({ label, size, min, max, direction, onSize }: Props) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))

  function start(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const x0 = e.clientX
    const s0 = size
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    document.body.classList.add("resizing")
    const move = (ev: PointerEvent) => onSize(clamp(s0 + direction * (ev.clientX - x0)))
    const up = () => {
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerup", up)
      document.body.classList.remove("resizing")
    }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerup", up)
  }

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(size)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={start}
      onDoubleClick={() => onSize(clamp((min + max) / 2))}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault()
          onSize(clamp(size + (e.key === "ArrowRight" ? 24 : -24) * direction))
        }
      }}
    />
  )
}

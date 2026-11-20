// The dashboard's signature: where an offer sits in the search funnel.
import type { Stage } from "../api"

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "puntuada", label: "Puntuada" },
  { stage: "seleccionada", label: "Seleccionada" },
  { stage: "cv", label: "CV listo" },
  { stage: "confirmada", label: "CV confirmado" },
  { stage: "aplicada", label: "Aplicada" },
  { stage: "entrevista", label: "Entrevista" },
]

const ORDER: Stage[] = ["nueva", "puntuada", "seleccionada", "cv", "confirmada", "aplicada", "entrevista"]

export const STAGE_LABEL: Record<Stage, string> = {
  nueva: "Nueva", puntuada: "Puntuada", seleccionada: "Seleccionada", cv: "CV listo",
  confirmada: "CV confirmado", aplicada: "Aplicada", entrevista: "Entrevista", cerrada: "Cerrada",
}

export function Pipeline({ stage, compact = false }: { stage: Stage; compact?: boolean }) {
  const closed = stage === "cerrada"
  const at = ORDER.indexOf(stage)
  return (
    <ol className={`pipeline${compact ? " compact" : ""}${closed ? " closed" : ""}`} aria-label={`Etapa: ${STAGE_LABEL[stage]}`}>
      {STEPS.map((s) => {
        const i = ORDER.indexOf(s.stage)
        const state = closed ? "off" : i < at ? "done" : i === at ? "current" : "off"
        return (
          <li key={s.stage} className={state} aria-current={state === "current" ? "step" : undefined}>
            <span className="dot" aria-hidden="true" />
            {!compact && <span className="step-label">{s.label}</span>}
          </li>
        )
      })}
    </ol>
  )
}

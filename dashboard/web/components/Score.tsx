// Score and probability badges: the band is always written out, never color alone.

export function bandOf(score: number): { label: string; tone: string } {
  if (score >= 75) return { label: "Fuerte", tone: "strong" }
  if (score >= 60) return { label: "Bueno", tone: "good" }
  if (score >= 45) return { label: "Moderado", tone: "moderate" }
  if (score >= 30) return { label: "Débil", tone: "weak" }
  return { label: "Bajo", tone: "poor" }
}

export function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="badge muted">Sin puntaje</span>
  const b = bandOf(score)
  return (
    <span className={`score tone-${b.tone}`} title={`Puntaje de ajuste ${score}/100, ${b.label}`}>
      <strong>{score}</strong>
      <span>{b.label}</span>
    </span>
  )
}

export function Probability({ value }: { value: number | undefined }) {
  if (value == null) return <span className="muted">—</span>
  const tone = value >= 50 ? "good" : value >= 25 ? "moderate" : "weak"
  return (
    <span className={`prob tone-${tone}`} title={`Probabilidad estimada ${value} %`}>
      <span className="bar" aria-hidden="true"><span style={{ width: `${value}%` }} /></span>
      {value} %
    </span>
  )
}

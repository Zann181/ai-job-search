// Remembered answers to application-form questions, so Chrome can complete
// forms on its own. A question with an empty answer is pending: the candidate has to
// answer it before any application that asks it can be sent.

export interface Answer {
  question: string
  answer: string
  updated: string
  /** Offer where the question first appeared, for context. */
  seen_in?: string
}

export const isPending = (a: Answer) => a.answer.trim() === ""

/** Case, accent and punctuation-insensitive key, so the same question is stored once. */
export const questionKey = (q: string) =>
  q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim()

/**
 * First contents of the answer memory, built from the profile's respuestas_semilla
 * (dashboard/candidato.local.json). A repeated question keeps its first answer.
 */
export function seedAnswers(seed: Pick<Answer, "question" | "answer">[], now: string): Answer[] {
  const seen = new Set<string>()
  const out: Answer[] = []
  for (const { question, answer } of seed) {
    const q = question.trim()
    if (!q || seen.has(questionKey(q))) continue
    seen.add(questionKey(q))
    out.push({ question: q, answer: answer.trim(), updated: now })
  }
  return out
}

/** `ready`: the form is filled and the CV uploaded, waiting for the candidate's own click on the final submit button. */
export interface ApplyOutcome { sent: boolean; ready: boolean; cvUploaded: boolean; reason: string; newQuestions: string[] }

/** Agent summary without its trailing JSON line(s), capped for storage. */
export const summaryOf = (result: string) =>
  result.split("\n").filter((l) => !/^\s*\{.*"(postulacion|probabilidad)".*\}\s*$/.test(l)).join("\n").trim().slice(0, 4000)

/** Reads the final JSON line of a Chrome run; null when the run did not report one. */
export function parseApplyOutcome(result: string): ApplyOutcome | null {
  const line = result.split("\n").reverse().find((l) => l.includes('"postulacion"'))
  if (!line) return null
  try {
    const o = JSON.parse(line.slice(line.indexOf("{"), line.lastIndexOf("}") + 1))
    return {
      sent: o.postulacion === "enviada",
      ready: o.postulacion === "lista",
      cvUploaded: o.cv_subido === true,
      reason: String(o.motivo ?? ""),
      newQuestions: Array.isArray(o.preguntas_nuevas) ? o.preguntas_nuevas.map(String).filter((q: string) => q.trim()) : [],
    }
  } catch { return null }
}

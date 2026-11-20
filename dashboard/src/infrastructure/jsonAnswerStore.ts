// AnswerStore over job_scraper/application_answers.json (gitignored, personal).
import { existsSync } from "node:fs"
import { join } from "node:path"
import { questionKey, seedAnswers, type Answer } from "../domain/answer"
import type { AnswerStore } from "../domain/ports"
import { ROOT, readJson, writeAtomic } from "./files"

const FILE = join(ROOT, "job_scraper", "application_answers.json")

export class JsonAnswerStore implements AnswerStore {
  /** `seed` (the profile's respuestas_semilla) is written only when the file does not exist yet. */
  constructor(seed: Pick<Answer, "question" | "answer">[] = []) {
    if (!existsSync(FILE)) this.save(seedAnswers(seed, new Date().toISOString()))
  }
  private save(list: Answer[]) { writeAtomic(FILE, JSON.stringify({ answers: list }, null, 1)) }
  all(): Answer[] { return readJson<{ answers?: Answer[] }>(FILE, {}).answers ?? [] }

  upsert(question: string, answer: string, seenIn?: string) {
    const q = question.trim()
    if (!q) throw new Error("Falta la pregunta.")
    const list = this.all()
    const i = list.findIndex((a) => questionKey(a.question) === questionKey(q))
    const entry: Answer = { question: i >= 0 ? list[i].question : q, answer: answer.trim(), updated: new Date().toISOString(), seen_in: i >= 0 ? list[i].seen_in : seenIn }
    if (i >= 0) list[i] = entry
    else list.push(entry)
    this.save(list)
    return entry
  }

  /** Records questions a form asked that have no answer yet; known ones are left alone. */
  addPending(questions: string[], seenIn: string) {
    const known = new Set(this.all().map((a) => questionKey(a.question)))
    for (const q of questions) if (q.trim() && !known.has(questionKey(q))) { this.upsert(q, "", seenIn); known.add(questionKey(q)) }
  }

  remove(question: string) {
    this.save(this.all().filter((a) => questionKey(a.question) !== questionKey(question)))
  }
}

// Runs agent tasks one at a time, so two sessions never write the same state files.
import { parseApplyOutcome, summaryOf } from "../domain/answer"
import { canApplyWithChrome } from "../domain/job"
import type { AgentRunner, AnswerStore, ApplyBrowser } from "../domain/ports"
import { TASK_DEFINITIONS, modelFor, type Task, type TaskType } from "../domain/task"
import { EMPTY_PROFILE, type CandidateProfile } from "../domain/candidate"
import type { JobService } from "./jobService"
import { promptFor } from "./prompts"
import { prepareAdaptation } from "../infrastructure/adaptation"

export class TaskQueue {
  private tasks: Task[] = []
  private running = false

  constructor(
    private runner: AgentRunner,
    private jobs: JobService,
    private root: string,
    private answers: AnswerStore,
    private browser: ApplyBrowser,
    private afterDocuments: () => void = () => {},
    private profile: CandidateProfile = EMPTY_PROFILE,
  ) {}

  enqueue(type: TaskType, key?: string): Task {
    const def = TASK_DEFINITIONS[type]
    if (!def) throw new Error(`Tarea desconocida: ${type}`)
    const job = def.needsJob ? this.jobs.get(key ?? "") : undefined
    if (type === "chrome" && job) {
      const blocked = canApplyWithChrome(job)
      if (blocked) throw new Error(blocked)
    }
    const task: Task = {
      id: crypto.randomUUID().slice(0, 8), type, key, model: modelFor(def), label: def.label,
      status: "queued", created: new Date().toISOString(), log: [],
    }
    this.tasks.unshift(task)
    void this.pump()
    return task
  }

  /**
   * Queues one task per job, skipping jobs that already have the same task pending,
   * a closed posting, or (unless forced) the result already: a CV for apply,
   * an estimate for critique.
   */
  enqueueBatch(type: TaskType, keys: string[], force = false) {
    if (type !== "apply" && type !== "critique") throw new Error("Solo se pueden lanzar en lote CVs y probabilidades.")
    const queued: Task[] = []
    const skipped: { key: string; reason: string }[] = []
    for (const key of new Set(keys)) {
      const job = this.jobs.get(key)
      const pending = this.tasks.some((t) => t.type === type && t.key === key && (t.status === "queued" || t.status === "running"))
      const reason = pending ? "ya está en cola"
        : job.check?.open === false ? "oferta cerrada"
        : !force && type === "apply" && job.application.cv_pdf ? "ya tiene CV"
        : !force && type === "critique" && job.critique ? "ya tiene probabilidad"
        : null
      if (reason) skipped.push({ key, reason })
      else queued.push(this.enqueue(type, key))
    }
    return { queued: queued.length, skipped }
  }

  list() { return this.tasks.map(({ log, result, ...t }) => ({ ...t, lines: log.length })) }
  get(id: string) { return this.tasks.find((t) => t.id === id) ?? null }

  private async pump() {
    if (this.running) return
    this.running = true
    try {
      let next: Task | undefined
      while ((next = this.tasks.find((t) => t.status === "queued"))) await this.run(next)
    } finally { this.running = false }
  }

  /** Chrome never submits: a form left ready waits for the candidate's click. Unanswered questions go to the answer memory. */
  private recordApplication(task: Task, key: string) {
    const outcome = task.result ? parseApplyOutcome(task.result) : null
    if (!outcome) return void task.log.push("No encontré la línea JSON del resultado de la postulación.")
    task.outcome = { sent: outcome.sent, ready: outcome.ready, newQuestions: outcome.newQuestions.length, reason: outcome.reason }
    if (outcome.sent) this.jobs.changeStatus(key, "applied")
    if (outcome.newQuestions.length) this.answers.addPending(outcome.newQuestions, this.jobs.get(key).title)
  }

  private async run(task: Task) {
    const def = TASK_DEFINITIONS[task.type]
    task.status = "running"
    try {
      const job = task.key ? this.jobs.get(task.key) : undefined
      if (def.browser) await this.browser.ensure()
      const adapt = task.type === "apply" && job ? prepareAdaptation(job) : null
      if (adapt) task.log.push(`Adaptando plantilla${adapt.templateId ? ` ${adapt.templateId}` : ""}${adapt.offerFile ? ` con la descripción guardada en ${adapt.offerFile}` : ""}.`)
      const code = await this.runner.run(def, task.model, promptFor(task.type, this.root, job, this.answers.all(), adapt, this.profile), (e) => {
        if (e.text) task.log.push(e.text)
        if (e.result != null) task.result = e.result
        if (e.cost_usd != null) task.cost_usd = e.cost_usd
      })
      task.status = code === 0 ? "done" : "error"
      if (task.type === "apply") this.afterDocuments()
      if (task.type === "chrome" && task.key) this.recordApplication(task, task.key)
      if (task.type === "critique" && task.key && task.result && !this.jobs.saveCritique(task.key, task.result)) {
        task.log.push("No encontré la línea JSON de la crítica en la respuesta.")
      }
    } catch (e) {
      task.status = "error"
      task.log.push(String((e as Error).message ?? e))
    }
    task.finished = new Date().toISOString()
    if (task.key) this.recordHistory(task, task.key)
  }

  /** Every job task, failed ones included, leaves a line in that job's history. */
  private recordHistory(task: Task, key: string) {
    const kind = task.type === "chrome" ? "postulacion" : task.type === "apply" ? "documentos" : task.type === "critique" ? "probabilidad" : null
    if (!kind) return
    const outcome = task.type === "chrome" && task.result ? parseApplyOutcome(task.result) : null
    try {
      this.jobs.addHistory(key, {
        date: task.finished ?? new Date().toISOString(),
        kind,
        ok: task.status === "done",
        sent: outcome?.sent,
        cv_uploaded: outcome?.cvUploaded,
        ready: outcome?.ready,
        reason: outcome?.reason || (task.status === "error" ? task.log.at(-1)?.slice(0, 300) : undefined),
        summary: task.result ? summaryOf(task.result) : task.log.slice(-3).join("\n").slice(0, 1500),
        cost_usd: task.cost_usd,
      })
    } catch (e) {
      task.log.push(`No pude guardar el historial: ${(e as Error).message}`)
    }
  }
}

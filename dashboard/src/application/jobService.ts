// Use cases over jobs: list, select, confirm a CV, change tracker status, follow up.
import { buildJob, isTrackerStatus, type HistoryEntry, type Job, type Posting } from "../domain/job"
import type { ApplicationTracker, PostingCatalog, PostingChecker, PreferenceStore } from "../domain/ports"

const SIX_HOURS = 6 * 60 * 60 * 1000

export class JobService {
  constructor(
    private catalog: PostingCatalog,
    private tracker: ApplicationTracker,
    private prefs: PreferenceStore,
    private checker: PostingChecker,
  ) {}

  private posting(key: string): Posting {
    const p = this.catalog.get(key)
    if (!p) throw new Error(`Oferta no encontrada: ${key}`)
    return p
  }

  private assemble(p: Posting, prefs = this.prefs.get(p.key)): Job {
    return buildJob(p, prefs, this.tracker.recordFor(p))
  }

  list(): Job[] {
    const all = this.prefs.all()
    return this.catalog.all()
      .map((p) => this.assemble(p, all[p.key] ?? {}))
      .sort((a, b) => (b.rank_score ?? -1) - (a.rank_score ?? -1))
  }

  get(key: string): Job {
    return this.assemble(this.posting(key))
  }

  select(key: string, selected: boolean) {
    this.posting(key)
    this.prefs.patch(key, { selected })
    return this.get(key)
  }

  confirmCv(key: string, confirmed: boolean) {
    const job = this.get(key)
    if (confirmed && !job.application.cv_pdf) throw new Error("No hay CV generado para confirmar.")
    this.prefs.patch(key, { cv_confirmed: confirmed })
    return this.get(key)
  }

  changeStatus(key: string, status: string) {
    if (!isTrackerStatus(status)) throw new Error(`Estado desconocido: ${status}`)
    this.tracker.setStatus(this.posting(key), status)
    return this.get(key)
  }

  async followUp(key: string) {
    const check = await this.checker.check(this.posting(key))
    this.prefs.patch(key, { check })
    return this.get(key)
  }

  async followUpSelected() {
    const keys = Object.entries(this.prefs.all()).filter(([, s]) => s.selected).map(([k]) => k)
    for (const k of keys) await this.followUp(k)
    this.prefs.setLastAutoCheck(new Date().toISOString())
    return keys.length
  }

  /** Re-checks selected offers every six hours while the dashboard runs. */
  startAutoFollowUp() {
    const tick = () => {
      const last = this.prefs.lastAutoCheck()
      if (!last || Date.now() - Date.parse(last) >= SIX_HOURS) {
        this.followUpSelected().catch((e) => console.error("seguimiento automático:", e))
      }
    }
    tick()
    setInterval(tick, 30 * 60 * 1000)
  }

  /** Newest first, capped so the state file stays small. */
  addHistory(key: string, entry: HistoryEntry) {
    const history = [entry, ...(this.prefs.get(key).history ?? [])].slice(0, 30)
    this.prefs.patch(key, { history })
  }

  saveCritique(key: string, raw: string): boolean {
    for (const line of raw.trim().split("\n").reverse()) {
      const m = line.match(/\{.*"probabilidad".*\}/)
      if (!m) continue
      try {
        const c = JSON.parse(m[0])
        this.prefs.patch(key, {
          critique: {
            probabilidad: Math.max(0, Math.min(100, Math.round(Number(c.probabilidad)))),
            nivel: String(c.nivel ?? ""),
            factores: Array.isArray(c.factores) ? c.factores.map(String).slice(0, 6) : [],
            recomendacion: String(c.recomendacion ?? ""),
            date: new Date().toISOString().slice(0, 10),
          },
        })
        return true
      } catch { /* try an earlier line */ }
    }
    return false
  }
}

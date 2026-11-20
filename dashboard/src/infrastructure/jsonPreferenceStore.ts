// PreferenceStore over job_scraper/dashboard_state.json (gitignored, personal).
import { join } from "node:path"
import type { JobPreferences } from "../domain/job"
import type { PreferenceStore } from "../domain/ports"
import { ROOT, readJson, writeAtomic } from "./files"

const STATE = join(ROOT, "job_scraper", "dashboard_state.json")

type StateFile = { jobs: Record<string, JobPreferences>; last_auto_check?: string }

export class JsonPreferenceStore implements PreferenceStore {
  private load(): StateFile {
    const s = readJson<Partial<StateFile>>(STATE, {})
    return { jobs: s.jobs ?? {}, last_auto_check: s.last_auto_check }
  }
  private save(s: StateFile) {
    writeAtomic(STATE, JSON.stringify(s, null, 1))
  }
  all() { return this.load().jobs }
  get(key: string) { return this.load().jobs[key] ?? {} }
  patch(key: string, patch: Partial<JobPreferences>) {
    const s = this.load()
    s.jobs[key] = { ...s.jobs[key], ...patch }
    this.save(s)
    return s.jobs[key]
  }
  lastAutoCheck() { return this.load().last_auto_check ?? null }
  setLastAutoCheck(iso: string) {
    const s = this.load()
    s.last_auto_check = iso
    this.save(s)
  }
}

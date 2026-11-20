// PostingCatalog over job_scraper/seen_jobs.json (read-only: /scrape and /rank own it)
// plus the offers marked by hand in the Buscador tab (job_scraper/manual_jobs.json).
import { join } from "node:path"
import type { Posting } from "../domain/job"
import type { PostingCatalog } from "../domain/ports"
import { ROOT, readJson } from "./files"
import type { ManualPostings } from "./manualPostings"

const SEEN = join(ROOT, "job_scraper", "seen_jobs.json")

function toPosting(key: string, j: any): Posting {
  return {
    key,
    title: j.title ?? "",
    company: j.company ?? "",
    location: j.location ?? null,
    url: j.url ?? "",
    portal: j.portal ?? "",
    posted_date: j.posted_date ?? null,
    deadline: j.deadline ?? null,
    scrape_status: j.status ?? "new",
    rank_score: j.rank_score ?? null,
    rank_verdict: j.rank_verdict ?? null,
    location_verdict: j.location_verdict ?? null,
    language_gate: j.language_gate ?? null,
    language_note: j.language_note ?? null,
    strengths: j.strengths ?? [],
    gaps: j.gaps ?? [],
    description: typeof j.description === "string" && j.description.trim() ? j.description : null,
    salary: j.salary ?? null,
    profile: j.profile ?? null,
  }
}

export class SeenJobsCatalog implements PostingCatalog {
  constructor(private manual?: ManualPostings) {}

  private load(): Record<string, any> {
    const seen = readJson<{ seen?: Record<string, any> }>(SEEN, {}).seen ?? {}
    // A marked offer has no /rank verdict: its fit score comes from the Buscador.
    const marked = Object.fromEntries(
      Object.entries(this.manual?.all() ?? {}).map(([k, m]) => [k, { ...m, status: "manual", posted_date: m.first_seen, rank_score: m.fit_score }]),
    )
    return { ...marked, ...seen }
  }
  all() {
    return Object.entries(this.load())
      .filter(([, j]) => j.status !== "skipped")
      .map(([k, j]) => toPosting(k, j))
  }
  get(key: string) {
    const j = this.load()[key]
    return j ? toPosting(key, j) : null
  }
}

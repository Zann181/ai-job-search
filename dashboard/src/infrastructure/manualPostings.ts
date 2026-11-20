// Offers the candidate marked in the Buscador tab, kept apart from seen_jobs.json
// (which /scrape and /rank own). SeenJobsCatalog shows both lists as one.
import { createHash } from "node:crypto"
import { join } from "node:path"
import type { MarkedOffer } from "../domain/search"
import { ROOT, readJson, writeAtomic } from "./files"

const FILE = join(ROOT, "job_scraper", "manual_jobs.json")

export interface ManualPosting {
  title: string
  company: string
  location: string
  url: string
  portal: string
  first_seen: string
  fit_score: number
  profile: string
  description: string
}

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")

/** Same shape as tools/job_key.py: company_title, length-capped and disambiguated by a hash of the full slug. */
export function manualKey(company: string, title: string, url: string): string {
  const full = `${slug(company)}_${slug(title)}`
  const hash = createHash("sha1").update(full || url).digest("hex").slice(0, 6)
  return `${slug(company).slice(0, 40) || "empresa"}_${slug(title).slice(0, 60) || "oferta"}-${hash}`
}

export class ManualPostings {
  all(): Record<string, ManualPosting> {
    return readJson<{ manual?: Record<string, ManualPosting> }>(FILE, {}).manual ?? {}
  }

  /** Adds the offer (idempotent: the same URL keeps its key) and returns its key. */
  add(o: MarkedOffer): string {
    const all = this.all()
    const existing = Object.entries(all).find(([, p]) => p.url === o.url)
    const key = existing?.[0] ?? manualKey(o.company, o.title, o.url)
    all[key] = {
      title: o.title,
      company: o.company,
      location: o.location,
      url: o.url,
      portal: o.portal,
      first_seen: existing?.[1].first_seen ?? new Date().toISOString().slice(0, 10),
      fit_score: o.score,
      profile: o.profile,
      description: o.description,
    }
    writeAtomic(FILE, JSON.stringify({ manual: all }, null, 2) + "\n")
    return key
  }
}

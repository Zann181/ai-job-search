// ApplicationTracker over job_search_tracker.csv, the same file /apply and /outcome write.
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { ApplicationRecord, Posting, TrackerStatus } from "../domain/job"
import { isTrackerStatus } from "../domain/job"
import type { ApplicationTracker } from "../domain/ports"
import { ROOT, writeAtomic } from "./files"

const TRACKER = join(ROOT, "job_search_tracker.csv")
const HEADER = [
  "date", "company", "sector", "role", "role_type", "channel", "status", "contact_person",
  "fit_rating", "notes", "cv_file", "cover_letter_file", "source", "deadline",
]

type Row = Record<string, string>

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  const endRow = () => {
    row.push(field)
    field = ""
    if (row.some((f) => f !== "")) rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ",") { row.push(field); field = "" }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      endRow()
    } else field += c
  }
  endRow()
  return rows
}

const csvField = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "")

function pdfFor(tex: string): string | null {
  if (!tex) return null
  const pdf = tex.replace(/\\/g, "/").replace(/\.tex$/, ".pdf")
  return existsSync(join(ROOT, pdf)) ? pdf : null
}

export class CsvTracker implements ApplicationTracker {
  private read(): Row[] {
    if (!existsSync(TRACKER)) return []
    const [header, ...rows] = parseCsv(readFileSync(TRACKER, "utf-8"))
    // Legacy rows predate the deadline column: missing trailing fields read as "".
    return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])))
  }

  private write(rows: Row[]) {
    const lines = [HEADER.join(","), ...rows.map((r) => HEADER.map((h) => csvField(r[h] ?? "")).join(","))]
    writeAtomic(TRACKER, lines.join("\n") + "\n")
  }

  private find(rows: Row[], p: Posting): number {
    const byUrl = rows.findIndex((r) => r.source && r.source === p.url)
    if (byUrl >= 0) return byUrl
    return rows.findIndex((r) => norm(r.company) === norm(p.company) && norm(r.role) === norm(p.title))
  }

  recordFor(p: Posting): ApplicationRecord {
    const rows = this.read()
    const row = rows[this.find(rows, p)]
    if (!row) return { status: null, cv_tex: null, cover_tex: null, cv_pdf: null, cover_pdf: null }
    return {
      status: isTrackerStatus(row.status) ? row.status : null,
      cv_tex: row.cv_file ? row.cv_file.replace(/\\/g, "/") : null,
      cover_tex: row.cover_letter_file ? row.cover_letter_file.replace(/\\/g, "/") : null,
      cv_pdf: pdfFor(row.cv_file),
      cover_pdf: pdfFor(row.cover_letter_file),
    }
  }

  setStatus(p: Posting, status: TrackerStatus) {
    const rows = this.read()
    const i = this.find(rows, p)
    if (i >= 0) rows[i].status = status
    else rows.push({
      date: new Date().toISOString().slice(0, 10),
      company: p.company,
      role: p.title,
      channel: p.portal,
      status,
      fit_rating: p.rank_score != null ? String(p.rank_score) : "",
      notes: "creada desde el dashboard",
      source: p.url,
      deadline: p.deadline ?? "",
    })
    this.write(rows)
  }
}

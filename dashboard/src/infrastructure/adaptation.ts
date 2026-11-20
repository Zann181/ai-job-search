// Prepares "Generar CV y carta" to adapt one of the cv/plantillas/ templates: saves the offer's
// description (as the portal gave it) to a file the agent reads through posting_guard, picks the
// template the Buscador scored the offer against, and puts the photo where a copy in cv/ finds it.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Job } from "../domain/job"
import { ROOT } from "./files"

const TEMPLATES = join(ROOT, "cv", "plantillas")
const PREFIX = "hoja_de_vida_"
const OFFERS = join("job_scraper", "ofertas")

export interface Adaptation {
  /** Repo-relative path of the saved description, or null when the job has none. */
  offerFile: string | null
  /** Template id (file name without hoja_de_vida_) matching the Buscador profile, if any. */
  templateId: string | null
  templateRole: string | null
  templates: string[]
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
const safeKey = (k: string) => k.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 120)

function roleOf(file: string): string {
  const src = readFileSync(join(TEMPLATES, file), "utf-8")
  const title = src.match(/pdftitle=\{([^}]*)\}/)?.[1] ?? ""
  return title.split(" - ").pop()?.trim() ?? ""
}

/** Null when there are no role templates: the dashboard then keeps the plain /apply flow. */
export function prepareAdaptation(job: Job): Adaptation | null {
  if (!existsSync(TEMPLATES)) return null
  const files = readdirSync(TEMPLATES).filter((n) => n.startsWith(PREFIX) && n.endsWith(".tex"))
  if (files.length === 0) return null

  let templateId: string | null = null
  let templateRole: string | null = null
  if (job.profile) {
    const want = norm(job.profile)
    for (const f of files) {
      const role = roleOf(f)
      if (role && norm(role) === want) { templateId = f.slice(PREFIX.length, -4); templateRole = role; break }
    }
  }

  let offerFile: string | null = null
  if (job.description?.trim()) {
    mkdirSync(join(ROOT, OFFERS), { recursive: true })
    offerFile = `${OFFERS}/${safeKey(job.key)}.txt`.replace(/\\/g, "/")
    const head = `${job.title}\n${job.company}${job.location ? ` · ${job.location}` : ""}\n${job.url}\n\n`
    writeFileSync(join(ROOT, offerFile), head + job.description, "utf-8")
  }

  // The templates include Foto_perfil.jpeg by a bare name; a copy compiled in cv/ needs it beside it.
  const photo = join(TEMPLATES, "Foto_perfil.jpeg")
  const target = join(ROOT, "cv", "Foto_perfil.jpeg")
  if (existsSync(photo) && !existsSync(target)) copyFileSync(photo, target)

  return { offerFile, templateId, templateRole, templates: files.map((f) => f.slice(PREFIX.length, -4)) }
}

import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

/** Workspace root: the repo that holds job_scraper/, cv/ and the tracker. */
export const ROOT = join(import.meta.dir, "..", "..", "..")

export const readJson = <T>(path: string, fallback: T): T =>
  existsSync(path) ? (JSON.parse(readFileSync(path, "utf-8")) as T) : fallback

const LATEX_LEFTOVERS = /\.(aux|log|out|fls|fdb_latexmk|synctex\.gz|txt)$/

/**
 * Removes compiler and text-extraction leftovers from cv/ and cover_letters/.
 * /apply leaves them behind when it runs headless, because deleting files needs
 * an approval nobody is there to give. Only these extensions and the build/
 * output folder are touched.
 */
export function cleanLatexLeftovers() {
  for (const dir of ["cv", "cover_letters"]) {
    const abs = join(ROOT, dir)
    if (!existsSync(abs)) continue
    for (const name of readdirSync(abs)) if (LATEX_LEFTOVERS.test(name)) rmSync(join(abs, name))
    rmSync(join(abs, "build"), { recursive: true, force: true })
  }
}

export function writeAtomic(path: string, text: string) {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, text, "utf-8")
  renameSync(tmp, path)
}

/**
 * Folder with the candidate's own CV sources and datos_cv.json (single source of facts for
 * generated CVs). It sits in the main checkout; from a worktree under .claude/worktrees/<name>/
 * it is three levels up. DASHBOARD_CV_DIR overrides.
 */
export function cvSourceDir(): string | null {
  // Inside .claude/worktrees/<name>/ the main checkout (three levels up) is searched too.
  const main = resolve(ROOT, "..", "..", "..")
  const roots = main !== ROOT && existsSync(join(main, ".git")) ? [ROOT, main] : [ROOT]
  const candidates = [process.env.DASHBOARD_CV_DIR, ...roots.flatMap((r) => (existsSync(r) ? readdirSync(r).filter((n) => /^hoja[_ ]?de[_ ]?vida/i.test(n)).map((n) => join(r, n)) : []))]
  return candidates.find((d): d is string => !!d && existsSync(join(d, "datos_cv.json"))) ?? null
}

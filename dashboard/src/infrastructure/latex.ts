// DocumentStore and DocumentCompiler over the LaTeX files in cv/ and cover_letters/.
// Paths are confined to those two folders; compiles run without shell escape.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve, sep } from "node:path"
import type { CompileResult, DocKind } from "../domain/document"
import type { DocumentCompiler, DocumentStore } from "../domain/ports"
import { ROOT } from "./files"

const ALLOWED = ["cv", "cover_letters"].map((d) => resolve(ROOT, d) + sep)

function safePath(texPath: string): string {
  const abs = resolve(ROOT, texPath)
  if (!ALLOWED.some((d) => abs.startsWith(d)) || !abs.endsWith(".tex")) throw new Error(`Ruta no permitida: ${texPath}`)
  return abs
}

export class TexFileStore implements DocumentStore {
  read(texPath: string) {
    const abs = safePath(texPath)
    if (!existsSync(abs)) throw new Error(`No existe ${texPath}`)
    return readFileSync(abs, "utf-8")
  }
  write(texPath: string, content: string) {
    writeFileSync(safePath(texPath), content, "utf-8")
  }
}

/** Page limit of the active CV template (ACTIVE-TEMPLATE block), 2 for stock moderncv. */
function cvPageLimit(): number {
  const guide = join(ROOT, ".claude", "skills", "job-application-assistant", "05-cv-templates.md")
  if (!existsSync(guide)) return 2
  const m = readFileSync(guide, "utf-8").match(/\*\*Page limit:\*\* exactly (\d+) page/)
  return m ? Number(m[1]) : 2
}

/** Engine by source: cover.cls and fontspec need xelatex/lualatex; the rest is pdflatex. */
function engineFor(source: string, kind: DocKind): string {
  if (kind === "cover" || /\\documentclass(\[[^\]]*\])?\{cover\}/.test(source)) return "xelatex"
  if (/\\usepackage(\[[^\]]*\])?\{fontspec\}|\\documentclass(\[[^\]]*\])?\{moderncv\}/.test(source)) return "lualatex"
  return "pdflatex"
}

function errorsFrom(log: string): string[] {
  const lines = log.split(/\r?\n/)
  const out: string[] = []
  lines.forEach((l, i) => {
    if (!l.startsWith("!") || l.includes("==> Fatal error")) return
    const at = lines.slice(i + 1, i + 8).find((x) => /^l\.\d+/.test(x))
    out.push(at ? `${l.slice(2)} (línea ${at.match(/^l\.(\d+)/)![1]})` : l.slice(2))
  })
  return [...new Set(out)].slice(0, 10)
}

export class LatexCompiler implements DocumentCompiler {
  async compile(texPath: string, kind: DocKind, pageLimitOverride?: number): Promise<CompileResult> {
    const abs = safePath(texPath)
    const dir = dirname(abs)
    const name = basename(abs, ".tex")
    const build = join(dir, "build")
    const pdf = join(dir, `${name}.pdf`)
    const pageLimit = pageLimitOverride ?? (kind === "cv" ? cvPageLimit() : 1)
    const engine = engineFor(readFileSync(abs, "utf-8"), kind)

    mkdirSync(build, { recursive: true })
    const proc = Bun.spawn([engine, "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", `-output-directory=build`, `${name}.tex`], {
      cwd: dir, stdout: "ignore", stderr: "ignore",
    })
    const timer = setTimeout(() => proc.kill(), 180_000)
    const code = await proc.exited
    clearTimeout(timer)

    const logPath = join(build, `${name}.log`)
    const log = existsSync(logPath) ? readFileSync(logPath, "latin1") : ""
    const built = join(build, `${name}.pdf`)
    const ok = code === 0 && existsSync(built)
    if (ok) {
      rmSync(pdf, { force: true })
      renameSync(built, pdf)
    }
    rmSync(build, { recursive: true, force: true })
    // TeX wraps log lines at 79 columns, which can split "(1 page" itself on long paths: unwrap first.
    const pages = log.replace(/\r?\n/g, "").match(/Output written on .*?\((\d+) pages?/)
    const rel = (p: string) => p.slice(ROOT.length + 1).replace(/\\/g, "/")
    return {
      ok,
      pages: ok && pages ? Number(pages[1]) : null,
      pageLimit,
      errors: ok ? [] : errorsFrom(log).concat(log ? [] : [`${engine} no produjo log (¿está instalado?)`]),
      pdf: ok ? rel(pdf) : null,
    }
  }
}

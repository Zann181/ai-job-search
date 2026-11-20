// Page images of a compiled PDF (pdftoppm), so the dashboard shows the sheet itself and never
// the browser's PDF viewer. Only PDFs under cv/ and cover_letters/ (templates included); the
// images live in the OS temp folder, keyed by the PDF's path, and are redrawn when the PDF changes.
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { join, normalize, resolve, sep } from "node:path"
import { ROOT } from "./files"

const DIR = join(tmpdir(), "dashboard-hojas")
const DPI = "144"
const ALLOWED = ["cv", "cover_letters"].map((d) => resolve(ROOT, d) + sep)

export interface SheetSet { pdf: string; pages: number; stamp: number }

const keyOf = (rel: string) => createHash("sha1").update(rel).digest("hex").slice(0, 16)

export class SheetRenderer {
  private pdfAbs(rel: string): string {
    const abs = resolve(ROOT, normalize(rel))
    if (!ALLOWED.some((d) => abs.startsWith(d)) || !abs.toLowerCase().endsWith(".pdf")) throw new Error(`PDF no permitido: ${rel}`)
    if (!existsSync(abs)) throw new Error(`No existe ${rel}`)
    return abs
  }

  private files(key: string) {
    if (!existsSync(DIR)) return []
    const re = new RegExp(`^${key}-(\\d+)\\.png$`)
    return readdirSync(DIR).filter((n) => re.test(n)).sort((a, b) => Number(a.match(re)![1]) - Number(b.match(re)![1]))
  }

  /** Renders the PDF's pages unless the images are already newer than the PDF. */
  async ensure(rel: string): Promise<SheetSet> {
    const pdf = this.pdfAbs(rel)
    const key = keyOf(rel)
    const pdfTime = statSync(pdf).mtimeMs
    let files = this.files(key)
    const fresh = files.length > 0 && files.every((f) => statSync(join(DIR, f)).mtimeMs >= pdfTime)
    if (!fresh) {
      mkdirSync(DIR, { recursive: true })
      for (const f of files) rmSync(join(DIR, f), { force: true })
      const proc = Bun.spawn(["pdftoppm", "-png", "-r", DPI, pdf, join(DIR, key)], { stdout: "ignore", stderr: "ignore" })
      const timer = setTimeout(() => proc.kill(), 60_000)
      await proc.exited
      clearTimeout(timer)
      files = this.files(key)
      if (files.length === 0) throw new Error("No se pudo dibujar la hoja (¿está pdftoppm de MiKTeX o Poppler en el PATH?).")
    }
    return { pdf: rel, pages: files.length, stamp: Math.round(statSync(join(DIR, files[0])).mtimeMs) }
  }

  /** Absolute path of page n (1-based) of an already rendered PDF, or null. */
  page(rel: string, n: number): string | null {
    try { this.pdfAbs(rel) } catch { return null }
    if (!Number.isInteger(n) || n < 1) return null
    const f = this.files(keyOf(rel))[n - 1]
    return f ? join(DIR, f) : null
  }
}

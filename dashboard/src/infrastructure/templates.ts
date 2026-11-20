// CV templates in cv/plantillas/: one LaTeX file per role, each kept separate. The editor
// reads, saves, imports and compiles them; /adaptar-plantilla copies one per job offer and
// never writes here. Ids are the file names without the hoja_de_vida_ prefix.
// The compiled sheet is drawn as page images by SheetRenderer (no browser PDF viewer).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { CompileResult } from "../domain/document"
import type { DocumentCompiler } from "../domain/ports"
import { ROOT } from "./files"
import type { SheetRenderer } from "./sheets"

const DIR = "cv/plantillas"
const PREFIX = "hoja_de_vida_"
const PAGE_LIMIT = 1
const ID = /^[a-z0-9_]{1,60}$/
const PHOTO = "Foto_perfil.jpeg"
const MAX_TEX = 300_000
const MAX_PHOTO = 6_000_000

export interface TemplateInfo {
  id: string
  path: string
  role: string
  headline: string
  subject: string
  keywords: string[]
  confirm: { line: number; text: string }[]
  anexos: boolean
  pdf: string | null
  pages: number | null
  updated: string
}

export interface PhotoInfo { exists: boolean; updated: string | null; bytes: number }

/** Drops a LaTeX comment (an unescaped %) from one line. */
const uncomment = (l: string) => l.replace(/(^|[^\\])%.*$/, "$1")

/** Readable text of a short LaTeX fragment: commands dropped, arguments kept. */
const plain = (s: string) =>
  s.replace(/\\textbar\\?\s?/g, "· ").replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?/g, "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim()

/** True when the attachments switch is turned on anywhere outside a comment. */
export const anexosOn = (src: string) => src.split("\n").some((l) => /\\anexostrue\b/.test(uncomment(l)))

/** Template id from a file name: "Hoja de Vida - Analista Datos.tex" -> "analista_datos". */
export function idFromName(name: string): string {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\.tex$/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    .replace(/^hoja_de_vida_?/, "")
  return base.slice(0, 60).replace(/_+$/, "")
}

/** Checks a LaTeX document before it is written into cv/plantillas/. */
export function checkTex(content: string) {
  if (content.length > MAX_TEX) throw new Error("El archivo .tex es demasiado grande (máx. 300 KB).")
  if (!/\\documentclass/.test(content) || !/\\begin\{document\}/.test(content)) throw new Error("No parece un documento LaTeX completo: falta \\documentclass o \\begin{document}.")
  if (anexosOn(content)) throw new Error("\\ifanexos debe seguir apagado (\\anexosfalse): los anexos no se activan hasta tener el certificado corregido.")
}

export class TemplateLibrary {
  private lastPages = new Map<string, number | null>()

  constructor(private compiler: DocumentCompiler, private sheets: SheetRenderer) {}

  private file(id: string) {
    if (!ID.test(id)) throw new Error(`Plantilla no válida: ${id}`)
    const rel = `${DIR}/${PREFIX}${id}.tex`
    if (!existsSync(join(ROOT, rel))) throw new Error(`No existe ${rel}`)
    return rel
  }

  async list(): Promise<TemplateInfo[]> {
    const abs = join(ROOT, DIR)
    if (!existsSync(abs)) return []
    const ids = readdirSync(abs).filter((n) => n.startsWith(PREFIX) && n.endsWith(".tex")).map((n) => n.slice(PREFIX.length, -4)).filter((id) => ID.test(id))
    // Page count of PDFs compiled before this run (or by hand), from their sheet images.
    for (const id of ids) {
      if (this.lastPages.has(id) || !existsSync(this.pdfAbs(id))) continue
      try { this.lastPages.set(id, (await this.sheets.ensure(this.pdfRel(id))).pages) } catch { /* shown as unknown */ }
    }
    return ids.map((id) => this.info(id))
  }

  private pdfRel(id: string) { return `${DIR}/${PREFIX}${id}.pdf` }
  private pdfAbs(id: string) { return join(ROOT, this.pdfRel(id)) }

  info(id: string): TemplateInfo {
    const rel = this.file(id)
    const src = readFileSync(join(ROOT, rel), "utf-8")
    const field = (k: string) => src.match(new RegExp(`${k}=\\{([^}]*)\\}`))?.[1] ?? ""
    const headline = src.match(/\\color\{acento\}\s*(.+?)\}\\par/)?.[1] ?? ""
    const pdfRel = rel.replace(/\.tex$/, ".pdf")
    return {
      id,
      path: rel,
      role: field("pdftitle").split(" - ").pop() || id.replace(/_/g, " "),
      headline: plain(headline),
      subject: field("pdfsubject"),
      keywords: field("pdfkeywords").split(",").map((k) => k.trim()).filter(Boolean),
      confirm: src.split("\n").flatMap((l, i) => {
        const m = l.match(/%\s*CONFIRMAR:?\s*(.*)$/)
        return m ? [{ line: i + 1, text: m[1].trim() }] : []
      }),
      anexos: anexosOn(src),
      pdf: existsSync(join(ROOT, pdfRel)) ? pdfRel : null,
      pages: this.lastPages.get(id) ?? null,
      updated: statSync(join(ROOT, rel)).mtime.toISOString(),
    }
  }

  read(id: string) {
    const rel = this.file(id)
    return { path: rel, content: readFileSync(join(ROOT, rel), "utf-8") }
  }

  /** Saves and compiles. Refuses to turn the attachments on: they stay off until the certificate is fixed. */
  async save(id: string, content: string): Promise<CompileResult> {
    const rel = this.file(id)
    checkTex(content)
    writeFileSync(join(ROOT, rel), content, "utf-8")
    return this.compile(id)
  }

  /** Imports an uploaded .tex as its own template file. An existing one is replaced only when asked. */
  async importTex(name: string, content: string, overwrite: boolean) {
    const id = idFromName(name)
    if (!ID.test(id) || id === "foto" || id === "importar") throw new Error("Ponle al archivo un nombre de rol con letras o números, por ejemplo hoja_de_vida_soporte_ti.tex.")
    checkTex(content)
    const abs = join(ROOT, DIR, `${PREFIX}${id}.tex`)
    if (existsSync(abs) && !overwrite) return { id, exists: true as const }
    mkdirSync(join(ROOT, DIR), { recursive: true })
    writeFileSync(abs, content.replace(/\r\n/g, "\n"), "utf-8")
    const result = await this.compile(id)
    return { id, exists: false as const, result, info: this.info(id) }
  }

  async compile(id: string): Promise<CompileResult> {
    const r = await this.compiler.compile(this.file(id), "cv", PAGE_LIMIT)
    if (r.ok) this.lastPages.set(id, r.pages)
    return r
  }

  photoPath() { return join(ROOT, DIR, PHOTO) }

  photo(): PhotoInfo {
    const p = this.photoPath()
    if (!existsSync(p)) return { exists: false, updated: null, bytes: 0 }
    const s = statSync(p)
    return { exists: true, updated: s.mtime.toISOString(), bytes: s.size }
  }

  /** Replaces the photo every template uses. JPEG only (the templates include Foto_perfil.jpeg); the previous one is kept as a backup. */
  savePhoto(bytes: Uint8Array): PhotoInfo {
    if (bytes.length === 0 || bytes.length > MAX_PHOTO) throw new Error("La imagen debe pesar menos de 6 MB.")
    if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) throw new Error("La foto debe ser JPEG.")
    const p = this.photoPath()
    mkdirSync(join(ROOT, DIR), { recursive: true })
    if (existsSync(p)) copyFileSync(p, join(ROOT, DIR, "Foto_perfil.anterior.jpeg"))
    writeFileSync(p, bytes)
    return this.photo()
  }
}

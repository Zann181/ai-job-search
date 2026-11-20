// Use cases over a job's tailored documents: read, save and compile the LaTeX.
import type { CompileResult, DocKind } from "../domain/document"
import type { DocumentCompiler, DocumentStore } from "../domain/ports"
import type { JobService } from "./jobService"

export class DocumentService {
  constructor(private jobs: JobService, private store: DocumentStore, private compiler: DocumentCompiler) {}

  private texPath(key: string, kind: DocKind): string {
    const app = this.jobs.get(key).application
    const tex = kind === "cv" ? app.cv_tex : app.cover_tex
    if (!tex) throw new Error(kind === "cv" ? "Esta oferta no tiene CV." : "Esta oferta no tiene carta.")
    return tex
  }

  read(key: string, kind: DocKind) {
    const path = this.texPath(key, kind)
    return { path, content: this.store.read(path) }
  }

  /** Saves the source; editing a confirmed CV withdraws the confirmation. */
  async saveAndCompile(key: string, kind: DocKind, content: string): Promise<CompileResult> {
    const path = this.texPath(key, kind)
    this.store.write(path, content)
    if (kind === "cv") this.jobs.confirmCv(key, false)
    return this.compiler.compile(path, kind)
  }
}

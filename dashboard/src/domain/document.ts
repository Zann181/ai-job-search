// Tailored application documents (CV and cover letter) as editable LaTeX sources.

export type DocKind = "cv" | "cover"

export interface CompileResult {
  ok: boolean
  pages: number | null
  pageLimit: number
  errors: string[]
  pdf: string | null
}

export const withinLimit = (r: Pick<CompileResult, "pages" | "pageLimit">) => r.pages != null && r.pages === r.pageLimit

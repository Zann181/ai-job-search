// Search profiles read from the candidate's own CV .tex files: one per \hypersetup
// block (role from pdftitle, keywords from pdfkeywords). Read locally, never sent out.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import type { CvProfile } from "../domain/search"
import { ROOT } from "./files"

function cvDirs(): string[] {
  const roots = [ROOT]
  // Inside .claude/worktrees/<name>/ the CV folders live in the main checkout.
  const main = resolve(ROOT, "..", "..", "..")
  if (main !== ROOT && existsSync(join(main, ".git"))) roots.push(main)
  const found: string[] = []
  const extra = process.env.DASHBOARD_CV_DIR
  if (extra) found.push(resolve(extra))
  for (const dir of roots) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if ((/^cv$/i.test(name) || /^hoja[_ ]?de[_ ]?vida/i.test(name)) && statSync(full).isDirectory()) found.push(full)
      // The role templates (Plantillas tab) are the candidate's own CVs, one per role.
      if (/^cv$/i.test(name) && existsSync(join(full, "plantillas"))) found.push(join(full, "plantillas"))
    }
  }
  // The role templates win, then the candidate's own CV folder, then the generated cv/ drafts.
  const own = (d: string) => (/plantillas$/i.test(d) ? 0 : /hoja[_ ]?de[_ ]?vida/i.test(d) ? 1 : 2)
  return [...new Set(found)].sort((a, b) => own(a) - own(b))
}

const clean = (s: string) => s.replace(/\\&/g, "&").replace(/\\[a-zA-Z]+\{?|[{}]/g, "").trim()

export class CvProfileSource {
  list(): CvProfile[] {
    const out: CvProfile[] = []
    const seen = new Set<string>()
    for (const dir of cvDirs()) {
      for (const file of readdirSync(dir).filter((n) => n.endsWith(".tex") && !/^main_example/.test(n))) {
        const text = readFileSync(join(dir, file), "utf-8")
        for (const block of text.match(/\\hypersetup\{[\s\S]*?\n\}/g) ?? []) {
          const title = /pdftitle=\{([^}]*)\}/.exec(block)?.[1]
          const kw = /pdfkeywords=\{([^}]*)\}/.exec(block)?.[1]
          if (!title || !kw) continue
          const role = clean(title.split(" - ").pop() ?? title)
          if (!role || seen.has(role)) continue
          seen.add(role)
          const keywords = kw.split(",").map(clean).filter(Boolean)
          const queries = [...new Set([role, keywords[0]].filter((x) => x && x.length > 3))].slice(0, 2)
          out.push({ id: role.toLowerCase().replace(/[^a-z0-9]+/g, "-"), role, keywords, queries, source: file })
        }
      }
    }
    return out
  }
}

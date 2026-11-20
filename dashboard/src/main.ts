// Composition root: build the React bundle, wire adapters into use cases, serve.
import { copyFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { DocumentService } from "./application/documentService"
import { JobService } from "./application/jobService"
import { TaskQueue } from "./application/taskQueue"
import { ClaudeCliRunner } from "./infrastructure/claudeCliRunner"
import { CsvTracker } from "./infrastructure/csvTracker"
import { ROOT, cleanLatexLeftovers } from "./infrastructure/files"
import { LatexCompiler, TexFileStore } from "./infrastructure/latex"
import { TemplateLibrary } from "./infrastructure/templates"
import { SheetRenderer } from "./infrastructure/sheets"
import { BraveApplyBrowser } from "./infrastructure/applyBrowser"
import { JsonAnswerStore } from "./infrastructure/jsonAnswerStore"
import { loadCandidateProfile } from "./infrastructure/candidateProfile"
import { JsonPreferenceStore } from "./infrastructure/jsonPreferenceStore"
import { PortalCliChecker } from "./infrastructure/portalCliChecker"
import { SeenJobsCatalog } from "./infrastructure/seenJobsCatalog"
import { SearchService } from "./application/searchService"
import { CvProfileSource } from "./infrastructure/cvProfiles"
import { ManualPostings } from "./infrastructure/manualPostings"
import { PortalSearcher } from "./infrastructure/portalSearcher"
import { startHttp } from "./interfaces/http"

const WEB = join(import.meta.dir, "..", "web")
const DIST = join(import.meta.dir, "..", "dist")
const PORT = Number(process.env.DASHBOARD_PORT ?? 4317)

mkdirSync(DIST, { recursive: true })
const build = await Bun.build({ entrypoints: [join(WEB, "main.tsx")], outdir: DIST, minify: true, naming: "[name].[ext]" })
if (!build.success) {
  for (const log of build.logs) console.error(log)
  process.exit(1)
}
copyFileSync(join(WEB, "index.html"), join(DIST, "index.html"))

const profile = loadCandidateProfile()
const manual = new ManualPostings()
const jobs = new JobService(new SeenJobsCatalog(manual), new CsvTracker(), new JsonPreferenceStore(), new PortalCliChecker())
const compiler = new LatexCompiler()
const sheetRenderer = new SheetRenderer()
const docs = new DocumentService(jobs, new TexFileStore(), compiler)
const answers = new JsonAnswerStore(profile.respuestas_semilla)
const browser = new BraveApplyBrowser(DIST)
const queue = new TaskQueue(new ClaudeCliRunner(browser.mcpConfig), jobs, ROOT, answers, browser, cleanLatexLeftovers, profile)

const search = new SearchService(new PortalSearcher(), new CvProfileSource(), manual, jobs)

startHttp({ jobs, docs, answers, browser, queue, search, templates: new TemplateLibrary(compiler, sheetRenderer), sheets: sheetRenderer, root: ROOT, distDir: DIST, port: PORT, profile })
jobs.startAutoFollowUp()
console.log(`Dashboard en http://127.0.0.1:${PORT}`)

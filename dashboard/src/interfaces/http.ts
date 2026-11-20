// HTTP adapter. Binds to 127.0.0.1 only; every /api call needs the per-run token
// embedded in the page and a localhost Host header, because the API can start
// Claude sessions and must not be reachable from other sites (CSRF, DNS rebinding).
import { existsSync, readFileSync } from "node:fs"
import { join, normalize, resolve, sep } from "node:path"
import { TRACKER_STATUSES } from "../domain/job"
import { TASK_DEFINITIONS, modelFor, type TaskType } from "../domain/task"
import type { AnswerStore, ApplyBrowser } from "../domain/ports"
import type { CandidateProfile } from "../domain/candidate"
import type { DocumentService } from "../application/documentService"
import type { JobService } from "../application/jobService"
import type { TaskQueue } from "../application/taskQueue"
import type { SearchService } from "../application/searchService"
import type { TemplateLibrary } from "../infrastructure/templates"
import type { SheetRenderer } from "../infrastructure/sheets"

interface Deps { jobs: JobService; docs: DocumentService; answers: AnswerStore; browser: ApplyBrowser; queue: TaskQueue; search: SearchService; templates: TemplateLibrary; sheets: SheetRenderer; root: string; distDir: string; port: number; profile: CandidateProfile }

const json = (data: unknown, status = 200) => Response.json(data, { status })
const fail = (e: unknown, status = 400) => json({ error: String((e as Error)?.message ?? e) }, status)

export function startHttp({ jobs, docs, answers, browser, queue, search, templates, sheets, root, distDir, port, profile }: Deps) {
  const token = crypto.randomUUID()
  const pdfDirs = ["cv", "cover_letters"].map((d) => resolve(root, d) + sep)

  function servePdf(rel: string): Response {
    const abs = resolve(root, normalize(decodeURIComponent(rel)))
    if (!pdfDirs.some((d) => abs.startsWith(d)) || !abs.toLowerCase().endsWith(".pdf") || !existsSync(abs)) {
      return new Response("not found", { status: 404 })
    }
    return new Response(Bun.file(abs), { headers: { "content-type": "application/pdf" } })
  }

  async function api(req: Request, path: string, query: URLSearchParams): Promise<Response> {
    const body: any = req.method === "POST" || req.method === "PUT" ? await req.json().catch(() => ({})) : {}
    if (req.method === "GET" && path === "/api/jobs") {
      const tasks = Object.values(TASK_DEFINITIONS).map((d) => ({ type: d.type, label: d.label, model: modelFor(d), needsJob: d.needsJob }))
      return json({ jobs: jobs.list(), statuses: TRACKER_STATUSES, tasks })
    }
    // Only what the page needs from dashboard/candidato.local.json: the salary floor and the search city.
    if (req.method === "GET" && path === "/api/perfil") {
      return json({ salario_minimo_mensual: profile.salario_minimo_mensual, ciudad: profile.ciudad })
    }
    if (req.method === "GET" && path === "/api/hojas") return json(await sheets.ensure(query.get("pdf") ?? ""))
    if (req.method === "GET" && path === "/api/plantillas") return json({ templates: await templates.list(), photo: templates.photo() })
    if (req.method === "POST" && path === "/api/plantillas/importar") {
      if (typeof body.content !== "string" || typeof body.name !== "string") return fail("Falta el archivo .tex")
      return json(await templates.importTex(body.name, body.content, !!body.overwrite))
    }
    if (req.method === "PUT" && path === "/api/plantillas/foto") {
      if (typeof body.data !== "string") return fail("Falta la imagen")
      return json(templates.savePhoto(Buffer.from(body.data, "base64")))
    }
    const pl = path.match(/^\/api\/plantillas\/([a-z0-9_]+)(\/compile)?$/)
    if (pl) {
      if (pl[2] && req.method === "POST") return json({ result: await templates.compile(pl[1]), info: templates.info(pl[1]) })
      if (!pl[2] && req.method === "GET") return json(templates.read(pl[1]))
      if (!pl[2] && req.method === "PUT" && typeof body.content === "string") {
        return json({ result: await templates.save(pl[1], body.content), info: templates.info(pl[1]) })
      }
    }
    if (req.method === "GET" && path === "/api/search/portals") return json(search.portals())
    if (req.method === "GET" && path === "/api/search/profiles") return json(search.cvProfiles())
    if (req.method === "GET" && path === "/api/search") {
      const age = Number(query.get("jobage"))
      return json({
        portals: await search.search({
          queries: (query.get("q") ?? "").split("|").map((x) => x.trim().slice(0, 100)).filter(Boolean).slice(0, 6),
          city: (query.get("city") ?? "").trim().slice(0, 60),
          remote: query.get("remote") === "1",
          jobage: Number.isInteger(age) && age >= 1 && age <= 365 ? age : null,
          portals: (query.get("portals") ?? "").split(",").filter(Boolean),
        }),
      })
    }
    if (req.method === "GET" && path === "/api/search/detail") {
      return json({ detail: await search.detail(query.get("portal") ?? "", query.get("url") ?? "") })
    }
    if (req.method === "POST" && path === "/api/search/mark") {
      const o = body.offer ?? {}
      const s = (v: unknown, max: number) => String(v ?? "").slice(0, max)
      return json(search.mark({
        url: s(o.url, 600), title: s(o.title, 200), company: s(o.company, 200), location: s(o.location, 200),
        portal: s(o.portal, 60), profile: s(o.profile, 120), description: s(o.description, 4000),
        score: Math.max(0, Math.min(100, Number(o.score) || 0)),
      }))
    }
    if (req.method === "POST" && path === "/api/search/unmark") return json(search.unmark(String(body.key ?? "")))
    if (req.method === "GET" && path === "/api/tasks") return json({ tasks: queue.list() })
    if (req.method === "GET" && path === "/api/browser") return json({ running: await browser.running() })
    if (req.method === "POST" && path === "/api/browser/open") {
      await browser.open(typeof body.url === "string" ? body.url : undefined)
      return json({ running: await browser.running() })
    }
    if (path === "/api/answers") {
      if (req.method === "GET") return json({ answers: answers.all() })
      if (req.method === "PUT") { answers.upsert(String(body.question ?? ""), String(body.answer ?? "")); return json({ answers: answers.all() }) }
      if (req.method === "POST" && body.remove) { answers.remove(String(body.question ?? "")); return json({ answers: answers.all() }) }
    }
    if (req.method === "POST" && path === "/api/tasks/batch") {
      if (!Array.isArray(body.keys)) return fail("Faltan las ofertas")
      return json(queue.enqueueBatch(body.type as TaskType, body.keys.map(String), !!body.force))
    }
    if (req.method === "POST" && path === "/api/tasks") return json(queue.enqueue(body.type as TaskType, body.key))
    const t = path.match(/^\/api\/tasks\/([\w-]+)$/)
    if (req.method === "GET" && t) return (queue.get(t[1]) && json(queue.get(t[1]))) || fail("Tarea no encontrada", 404)
    if (req.method === "POST" && path === "/api/follow-up") {
      return json(body.key ? await jobs.followUp(body.key) : { checked: await jobs.followUpSelected() })
    }
    const d = path.match(/^\/api\/jobs\/([^/]+)\/tex$/)
    if (d) {
      const key = decodeURIComponent(d[1])
      const kind = query.get("doc") === "cover" ? "cover" : "cv"
      if (req.method === "GET") return json(docs.read(key, kind))
      if (req.method === "PUT" && typeof body.content === "string") return json(await docs.saveAndCompile(key, kind, body.content))
    }
    const m = path.match(/^\/api\/jobs\/([^/]+)\/(select|confirm-cv|status)$/)
    if (req.method === "POST" && m) {
      const key = decodeURIComponent(m[1])
      if (m[2] === "select") return json(jobs.select(key, !!body.selected))
      if (m[2] === "confirm-cv") return json(jobs.confirmCv(key, !!body.confirmed))
      return json(jobs.changeStatus(key, String(body.status)))
    }
    return fail("Ruta desconocida", 404)
  }

  Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(req, server) {
      const url = new URL(req.url)
      // Bun closes a connection idle for 10 s with no reply (browser: ERR_EMPTY_RESPONSE). A portal
      // search runs several CLIs and takes far longer, so API calls get no idle timeout.
      if (url.pathname.startsWith("/api/")) server.timeout(req, 0)
      const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "")
      if (host !== "127.0.0.1" && host !== "localhost") return new Response("forbidden", { status: 403 })

      if (url.pathname.startsWith("/api/")) {
        if (req.headers.get("x-dash-token") !== token) return fail("Token inválido", 403)
        try { return await api(req, url.pathname, url.searchParams) } catch (e) { return fail(e) }
      }
      if (url.pathname === "/hoja" || url.pathname === "/plantilla-foto") {
        if (url.searchParams.get("t") !== token) return new Response("forbidden", { status: 403 })
        const sheet = url.pathname === "/hoja"
        const file = sheet ? sheets.page(url.searchParams.get("pdf") ?? "", Number(url.searchParams.get("n"))) : templates.photoPath()
        if (!file || !existsSync(file)) return new Response("not found", { status: 404 })
        return new Response(Bun.file(file), { headers: { "content-type": sheet ? "image/png" : "image/jpeg", "cache-control": "no-store" } })
      }
      if (url.pathname.startsWith("/pdf/")) {
        if (url.searchParams.get("t") !== token) return new Response("forbidden", { status: 403 })
        return servePdf(url.pathname.slice(5))
      }
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const html = readFileSync(join(distDir, "index.html"), "utf-8").replace("__TOKEN__", token)
        return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })
      }
      const asset = resolve(distDir, "." + url.pathname)
      if (asset.startsWith(resolve(distDir) + sep) && existsSync(asset)) return new Response(Bun.file(asset))
      return new Response("not found", { status: 404 })
    },
  })
}

// Runs the portal CLIs in .agents/skills/ (argv array, no shell: user input never becomes a command).
import { join } from "node:path"
import type { Offer, OfferDetail, PortalInfo, PortalResult, SearchParams, SearchPass } from "../domain/search"
import { ROOT } from "./files"

const CLI_TIMEOUT_MS = 90_000
const DETAIL_TIMEOUT_MS = 45_000

interface Portal {
  label: string
  market: string
  defaultOn: boolean
  /** argv after `bun run <cli>`; null when the portal cannot run this search. */
  args(q: string, loc: string, jobage: number | null): string[] | null
}

const cli = (name: string) => join(ROOT, ".agents", "skills", name, "cli", "src", "cli.ts")
const searchArgs = (q: string, loc: string, jobage: number | null) =>
  q ? ["search", "-q", q, ...(loc ? ["-l", loc] : []), ...(jobage ? ["--jobage", String(jobage)] : []), "--limit", "20"] : null

const PORTALS: Record<string, Portal> = {
  "computrabajo-search": { label: "Computrabajo", market: "Colombia", defaultOn: true, args: searchArgs },
  "elempleo-search": { label: "elempleo.com", market: "Colombia", defaultOn: true, args: searchArgs },
  "magneto-search": {
    label: "Magneto365",
    market: "Colombia",
    defaultOn: true,
    // No --jobage: Magneto listing pages carry no dates and the CLI refuses the flag.
    args: (q, loc) => ["search", ...(q ? ["-q", q] : []), ...(loc ? ["-l", loc] : []), "--limit", "20"],
  },
  "serviciodeempleo-search": { label: "Servicio Público de Empleo", market: "Colombia", defaultOn: true, args: searchArgs },
  // Remote / LatAm boards (public JSON or RSS). Their CLIs read -l as "offers open to that place".
  "getonbrd-search": { label: "Get on Board", market: "Colombia + LatAm", defaultOn: true, args: searchArgs },
  "remoteok-search": { label: "Remote OK", market: "Remoto", defaultOn: false, args: searchArgs },
  "himalayas-search": { label: "Himalayas", market: "Remoto", defaultOn: false, args: searchArgs },
  "jobicy-search": { label: "Jobicy", market: "Remoto", defaultOn: false, args: searchArgs },
  "workingnomads-search": { label: "Working Nomads", market: "Remoto", defaultOn: false, args: searchArgs },
  "weworkremotely-search": { label: "We Work Remotely", market: "Remoto", defaultOn: false, args: searchArgs },
  "arbeitnow-search": { label: "Arbeitnow", market: "Remoto Europa", defaultOn: false, args: searchArgs },
  "linkedin-search": {
    label: "LinkedIn",
    market: "Global",
    defaultOn: false,
    args: (q, loc, jobage) => [
      "search", ...(q ? ["-q", q] : []), "-l", loc ? `${loc}, Colombia` : "Colombia",
      ...(jobage ? ["--jobage", String(jobage)] : []), "--limit", "20",
    ],
  },
}

const REMOTE_NATIVE = new Set([
  "serviciodeempleo-search", "getonbrd-search", "remoteok-search", "himalayas-search",
  "jobicy-search", "workingnomads-search", "weworkremotely-search", "arbeitnow-search",
])

const STOPWORDS =new Set(["de", "del", "en", "y", "la", "el", "para", "con"])

async function spawnCli(name: string, args: string[], timeoutMs: number) {
  const proc = Bun.spawn(["bun", "run", cli(name), ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" })
  const timer = setTimeout(() => proc.kill(), timeoutMs)
  try {
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
    return { stdout, stderr, code }
  } finally {
    clearTimeout(timer)
  }
}

/** The CLIs report errors as {"error": "..."} on stderr (or stdout). */
function errorText(stderr: string, stdout: string, code: number): string {
  let msg = stderr.trim() || stdout.trim() || `salió con código ${code}`
  try { msg = JSON.parse(msg).error ?? msg } catch { /* plain text */ }
  return msg
}

export class PortalSearcher {
  portals(): PortalInfo[] {
    return Object.entries(PORTALS).map(([id, p]) => ({ id, label: p.label, market: p.market, defaultOn: p.defaultOn }))
  }

  has(id: string) { return id in PORTALS }

  /**
   * Magneto only has one page of 20 offers per job title of its own list or per
   * city, and nothing for a title it does not know ("analista de datos" gives
   * zero). So: each whole query and each of its words as a title page, plus the
   * city page. None of the title pages is narrowed to the city on Magneto's
   * side, so they are tagged unverifiedLocation.
   */
  private magnetoPasses(queries: string[], city: string): SearchPass[] {
    const titles = new Set<string>()
    for (const q of queries) {
      titles.add(q)
      for (const w of q.toLowerCase().split(/\s+/)) if (w.length > 3 && !STOPWORDS.has(w)) titles.add(w)
    }
    const out: SearchPass[] = [...titles].map((q) => ({ q, loc: "", unverifiedLocation: true }))
    if (city) out.unshift({ q: "", loc: city, unverifiedLocation: false })
    return out
  }

  private passesFor(portal: string, p: SearchParams): SearchPass[] {
    if (portal === "magneto-search") return this.magnetoPasses(p.queries, p.city)
    const base = p.queries.length ? p.queries : [""]
    const passes: SearchPass[] = base.map((q) => ({ q, loc: p.city, unverifiedLocation: false }))
    // Remote boards are remote by nature, and the SPE CLI needs every word of the query to match:
    // a "<cargo> remoto" pass would only find nothing there.
    if (REMOTE_NATIVE.has(portal)) return passes
    // A second search per title with no city, for remote offers.
    if (p.remote) for (const q of base) if (q) passes.push({ q: `${q} remoto`, loc: "", unverifiedLocation: true })
    return passes
  }

  private async runOne(name: string, pass: SearchPass, jobage: number | null): Promise<{ ok: true; results: Offer[] } | { ok: false; error: string }> {
    const portal = PORTALS[name]
    // elempleo and Computrabajo reject "Colombia" as a city; it just means "everywhere".
    const loc = name !== "linkedin-search" && /^colombia$/i.test(pass.loc) ? "" : pass.loc
    const args = portal.args(pass.q, loc, jobage)
    if (!args) return { ok: false, error: "Necesita un cargo o palabra clave." }
    try {
      const { stdout, stderr, code } = await spawnCli(name, args, CLI_TIMEOUT_MS)
      if (code !== 0) {
        const msg = errorText(stderr, stdout, code)
        // Magneto answers a title it has no page for with this error: just no offers.
        if (/Landing page not found/i.test(msg)) return { ok: true, results: [] }
        return { ok: false, error: msg }
      }
      const data = JSON.parse(stdout) as { results?: Offer[] }
      return { ok: true, results: (data.results ?? []).map((r) => ({ ...r, query: pass.q, unverifiedLocation: pass.unverifiedLocation })) }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  /** One portal: its passes three at a time, merged and de-duplicated by URL. */
  private async runPortal(name: string, params: SearchParams): Promise<PortalResult> {
    const label = PORTALS[name].label
    const queue = this.passesFor(name, params)
    const merged = new Map<string, Offer>()
    const errors: string[] = []
    let anyOk = false
    const worker = async () => {
      for (let pass = queue.shift(); pass; pass = queue.shift()) {
        const r = await this.runOne(name, pass, params.jobage)
        if (!r.ok) { errors.push(`"${pass.q}": ${r.error}`); continue }
        anyOk = true
        for (const o of r.results) {
          const known = merged.get(o.url)
          if (!known) merged.set(o.url, o)
          // Found by the city search too: it is a city offer, not only a remote one.
          else if (!pass.unverifiedLocation) known.unverifiedLocation = false
        }
      }
    }
    await Promise.all([worker(), worker(), worker()])
    const error = errors.join(" · ") || undefined
    if (!anyOk) return { portal: name, label, ok: false, error: error ?? "Sin respuesta", results: [] }
    return { portal: name, label, ok: true, error, results: [...merged.values()] }
  }

  search(params: SearchParams): Promise<PortalResult[]> {
    return Promise.all(params.portals.filter((p) => this.has(p)).map((p) => this.runPortal(p, params)))
  }

  /** Full posting text: experience and remote work are read from it. */
  async detail(portal: string, url: string): Promise<OfferDetail | null> {
    if (!this.has(portal) || portal === "linkedin-search" || !/^https:\/\//i.test(url)) return null
    try {
      const { stdout, code } = await spawnCli(portal, ["detail", url], DETAIL_TIMEOUT_MS)
      if (code !== 0) return null
      const d = JSON.parse(stdout) as { description?: string; remote?: boolean }
      return { description: String(d.description ?? "").slice(0, 4000), remote: d.remote === true }
    } catch {
      return null
    }
  }
}

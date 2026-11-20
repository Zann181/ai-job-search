// Buscador tab: search the Colombian portals for the CV profiles the candidate picks,
// score every offer against the profile, filter without searching again, and mark
// the offers to apply to (they join the Ofertas / Postulaciones pipeline).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { api, type CvProfile, type Job, type PortalInfo, type PortalResult } from "../api"
import {
  DEFAULT_EXCLUDE, TIER_LABEL, isRemote, rejectReason, scoreFor, tierOf, words,
  type Filters, type Row, type Score, type Tier,
} from "../search/scoring"

const ENRICH_MAX = 60
const safeUrl = (u: string) => (/^https:\/\//i.test(u) ? u : undefined)

interface Placed { row: Row; score: Score; profile: CvProfile }
interface Dropped extends Placed { why: string }

export function Buscador({ onMarked }: { onMarked: () => void }) {
  const [portals, setPortals] = useState<PortalInfo[]>([])
  const [portalOn, setPortalOn] = useState<Set<string>>(new Set())
  const [profiles, setProfiles] = useState<CvProfile[]>([])
  const [profileOn, setProfileOn] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState("")
  const [city, setCity] = useState("")
  const [jobage, setJobage] = useState("30")
  const [expMax, setExpMax] = useState("1")
  const [remote, setRemote] = useState(true)
  const [useAdvanced, setUseAdvanced] = useState(true)
  const [include, setInclude] = useState("")
  const [exclude, setExclude] = useState(DEFAULT_EXCLUDE)
  const [advDirty, setAdvDirty] = useState(false)
  const [minScore, setMinScore] = useState("50")
  const [hideConf, setHideConf] = useState(false)

  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState("")
  const [results, setResults] = useState<PortalResult[] | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [analyzing, setAnalyzing] = useState<{ done: number; total: number } | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<"ok" | "no">("ok")
  const [pageSize, setPageSize] = useState(10)
  const [pages, setPages] = useState<Record<string, number>>({})
  const [marked, setMarked] = useState<Map<string, string>>(new Map()) // url -> job key
  const gen = useRef(0)

  // Portals, CV profiles and the offers already marked.
  useEffect(() => {
    api.searchPortals().then((p) => { setPortals(p); setPortalOn(new Set(p.filter((x) => x.defaultOn).map((x) => x.id))) }).catch((e) => setMessage(e.message))
    api.cvProfiles().then((p) => {
      setProfiles(p)
      // Start with the two most search-friendly roles of the CV.
      setProfileOn(new Set(p.filter((x) => /datos|full stack/i.test(x.role)).map((x) => x.id)))
    }).catch(() => {})
    api.jobs().then((d) => setMarked(new Map(d.jobs.filter((j) => j.selected && j.url).map((j) => [j.url, j.key])))).catch(() => {})
    // Default city: the first part of "ciudad" in dashboard/candidato.local.json ("Ciudad, Departamento").
    api.profile().then((p) => { const c = (p.ciudad ?? "").split(",")[0].trim(); if (c) setCity((now) => now || c) }).catch(() => {})
  }, [])

  const chosen = useMemo(() => profiles.filter((p) => profileOn.has(p.id)), [profiles, profileOn])

  // Advanced fields follow the chosen CV profiles until the candidate edits them by hand.
  useEffect(() => {
    if (advDirty) return
    const kws: string[] = []
    for (const p of chosen) for (const k of p.keywords.slice(1)) if (!kws.includes(k)) kws.push(k)
    setInclude(kws.slice(0, 12).join(", "))
    setExclude(DEFAULT_EXCLUDE)
  }, [chosen, advDirty])

  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => {
    const next = new Set(set)
    next.has(v) ? next.delete(v) : next.add(v)
    apply(next)
  }

  async function search() {
    const queries = [...new Set([...chosen.map((p) => p.queries[0]), ...extra.split("|").map((x) => x.trim())].filter(Boolean))]
    const my = ++gen.current
    setSearching(true)
    setResults(null); setRows([]); setPages({}); setTab("ok"); setHidden(new Set()); setAnalyzing(null)
    setMessage(`Buscando ${queries.length} cargo${queries.length === 1 ? "" : "s"} en ${portalOn.size} portal${portalOn.size === 1 ? "" : "es"}… (puede tardar un minuto)`)
    try {
      const { portals: found } = await api.search({ queries, city: city.trim(), remote, jobage: jobage ? Number(jobage) : null, portals: [...portalOn] })
      if (my !== gen.current) return
      const seen = new Set<string>()
      const list: Row[] = []
      for (const p of found) for (const o of p.results) {
        if (seen.has(o.url)) continue
        seen.add(o.url)
        list.push({ ...o, portal: p.label, portalId: p.portal })
      }
      setResults(found); setRows(list); setMessage("")
      void enrich(list, my)
    } catch (e) {
      if (my === gen.current) setMessage((e as Error).message)
    } finally {
      if (my === gen.current) setSearching(false)
    }
  }

  /** Reads the full text of the most promising offers so experience and remote work come from the posting itself. */
  async function enrich(list: Row[], my: number) {
    const todo = list
      .filter((r) => r.portalId !== "linkedin-search")
      .map((r) => ({ r, s: Math.max(0, ...chosen.map((p) => scoreFor(r, p, city).total)) + (r.unverifiedLocation ? 5 : 0) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, ENRICH_MAX)
      .map((x) => x.r)
    const total = todo.length
    let done = 0
    if (total) setAnalyzing({ done: 0, total })
    const worker = async () => {
      for (let r = todo.shift(); r && my === gen.current; r = todo.shift()) {
        const detail = await api.offerDetail(r.portalId, r.url).then((x) => x.detail).catch(() => null)
        if (my !== gen.current) return
        setRows((prev) => prev.map((x) => (x.url === r.url ? (detail ? { ...x, detail } : { ...x, skipDetail: true }) : x)))
        setAnalyzing({ done: ++done, total })
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()])
    if (my === gen.current) setAnalyzing(null)
  }

  const filters: Filters = useMemo(() => ({
    city, remote, expMax: expMax ? Number(expMax) : null, useAdvanced,
    include: words(include), exclude: words(exclude), minScore: Number(minScore), hideConfidential: hideConf,
  }), [city, remote, expMax, useAdvanced, include, exclude, minScore, hideConf])

  // Each offer goes under the chosen profile it fits best, or to the discarded list with the reason.
  const { groups, dropped } = useMemo(() => {
    const groups = new Map<string, Placed[]>(chosen.map((p) => [p.id, []]))
    const dropped: Dropped[] = []
    if (chosen.length) for (const row of rows) {
      if (hidden.has(row.portalId)) continue
      let best: { profile: CvProfile; score: Score } | null = null
      for (const profile of chosen) {
        const score = scoreFor(row, profile, city)
        if (!best || score.total > best.score.total) best = { profile, score }
      }
      if (!best) continue
      const why = rejectReason(row, best.score, filters)
      if (why) dropped.push({ row, score: best.score, profile: best.profile, why })
      else groups.get(best.profile.id)!.push({ row, score: best.score, profile: best.profile })
    }
    for (const list of groups.values()) list.sort((a, b) => b.score.total - a.score.total)
    dropped.sort((a, b) => b.score.total - a.score.total)
    return { groups, dropped }
  }, [rows, chosen, hidden, city, filters])

  const kept = [...groups.values()].reduce((n, l) => n + l.length, 0)

  const toggleMark = useCallback(async (p: Placed) => {
    try {
      const key = marked.get(p.row.url)
      if (key) {
        await api.unmarkOffer(key)
        setMarked((m) => { const n = new Map(m); n.delete(p.row.url); return n })
      } else {
        const job: Job = await api.markOffer({
          url: p.row.url, title: p.row.title, company: p.row.company ?? "", location: p.row.location ?? "", portal: p.row.portalId,
          score: p.score.total, profile: p.profile.role, description: p.row.detail?.description ?? "",
        })
        setMarked((m) => new Map(m).set(p.row.url, job.key))
      }
      onMarked()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }, [marked, onMarked])

  const page = (key: string, total: number) => Math.min(pages[key] ?? 0, Math.max(0, Math.ceil(total / pageSize) - 1))
  const slice = <T,>(key: string, list: T[]) => list.slice(page(key, list.length) * pageSize, (page(key, list.length) + 1) * pageSize)
  const setPage = (key: string, n: number) => setPages((p) => ({ ...p, [key]: n }))

  // Plain render helpers, not components: a component declared here would remount on every
  // state change (e.g. while offers are analyzed) and close every open <details>.
  function renderPager(id: string, total: number): ReactNode {
    const count = Math.ceil(total / pageSize)
    if (count <= 1) return null
    const cur = page(id, total)
    return (
      <div className="bs-pager" key={`pager-${id}`}>
        <button className="secondary" disabled={cur === 0} onClick={() => setPage(id, cur - 1)}>‹ Anterior</button>
        {Array.from({ length: count }, (_, i) => (
          <button key={i} className={i === cur ? "primary" : "secondary"} aria-current={i === cur ? "page" : undefined} onClick={() => setPage(id, i)}>{i + 1}</button>
        ))}
        <button className="secondary" disabled={cur >= count - 1} onClick={() => setPage(id, cur + 1)}>Siguiente ›</button>
        <span className="muted small">{cur * pageSize + 1}–{Math.min(total, (cur + 1) * pageSize)} de {total}</span>
      </div>
    )
  }

  function renderOffer(p: Placed): ReactNode {
    const { row: j, score: sc } = p
    const tier = tierOf(sc.total)
    const href = safeUrl(j.url)
    const isMarked = marked.has(j.url)
    return (
      <details className="bs-job" key={j.url}>
        <summary>
          <span className="bs-title">{isMarked && <span className="bs-star" aria-label="Marcada">★</span>}{j.title}</span>
          <span className={`bs-score ${tier}`}><b>{sc.total}</b><small>{j.detail ? "afinidad" : "prelim."}</small></span>
          <span className="bs-meta muted">
            {[j.company, j.location, j.dateText || j.date, j.portal].filter(Boolean).map((v, i) => <span key={i}>{v}</span>)}
            {sc.years != null && <span>{sc.years === 0 ? "sin experiencia" : `exp. ${Math.round(sc.years * 10) / 10} a`}</span>}
            {isRemote(j) && <span>remoto</span>}
          </span>
        </summary>
        <div className="bs-detail">
          <div className="bs-parts small muted">
            <span>Cargo <b>{sc.parts.role}/35</b></span><span>Habilidades <b>{sc.parts.kw}/40</b></span>
            <span>Experiencia <b>{sc.parts.exp}/15</b></span><span>Ubicación <b>{sc.parts.place}/10</b></span>
          </div>
          {sc.hits.length > 0 && <div className="bs-kw">{sc.hits.map((h) => <span key={h} className="tag">{h}</span>)}</div>}
          {j.detail?.description ? <p className="bs-snip muted">{j.detail.description.slice(0, 600)}</p> : <p className="muted small">Descripción aún sin analizar.</p>}
          <div className="bs-actions">
            <button className={isMarked ? "secondary" : "primary"} onClick={() => toggleMark(p)}>
              {isMarked ? "★ Quitar de postulaciones" : "☆ Marcar para postular"}
            </button>
            {href && <a href={href} target="_blank" rel="noopener noreferrer">Abrir la oferta ↗</a>}
          </div>
        </div>
      </details>
    )
  }

  function renderProfile(profile: CvProfile, list: Placed[]): ReactNode {
    const avg = list.length ? Math.round(list.reduce((n, x) => n + x.score.total, 0) / list.length) : 0
    const shown = slice(profile.id, list)
    return (
      <details className="bs-profile" open key={profile.id}>
        <summary><strong>{profile.role}</strong> <span className="muted small">{list.length} ofertas{list.length ? ` · afinidad media ${avg}` : ""}</span></summary>
        {(["hi", "mid", "lo"] as Tier[]).map((t) => {
          const items = shown.filter((x) => tierOf(x.score.total) === t)
          return items.length === 0 ? null : (
            <details key={t} className={`bs-tier ${t}`} open={t !== "lo"}>
              <summary>{TIER_LABEL[t]} <span className="muted small">({items.length} en esta página)</span></summary>
              {items.map(renderOffer)}
            </details>
          )
        })}
        {list.length === 0 && <p className="muted bs-pad">Nada con estos filtros. Mira Descartadas o desactiva los filtros avanzados.</p>}
        {renderPager(profile.id, list.length)}
      </details>
    )
  }

  const portalChips = (results ?? []).filter((p) => p.ok)

  return (
    <div className="bs">
      <form className="bs-form" onSubmit={(e) => { e.preventDefault(); void search() }}>
        <details className="bs-panel" open>
          <summary>1 · Mi perfil <span className="muted small">{chosen.map((p) => p.role).join(" · ") || "ninguno"}</span></summary>
          <div className="bs-body">
            <p className="muted small">Elige uno o varios perfiles de tu hoja de vida. Cada oferta se puntúa contra el perfil que mejor le queda.</p>
            <div className="bs-chips">
              {profiles.map((p) => (
                <button type="button" key={p.id} className={`chip ${profileOn.has(p.id) ? "on" : ""}`} aria-pressed={profileOn.has(p.id)} onClick={() => toggle(profileOn, p.id, setProfileOn)}>{p.role}</button>
              ))}
              {profiles.length === 0 && <span className="muted small">No encontré hojas de vida .tex; usa el campo de cargo.</span>}
            </div>
            <label>Otro cargo (opcional, varios con |)
              <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="auxiliar de sistemas | soporte TI" />
            </label>
          </div>
        </details>

        <details className="bs-panel" open>
          <summary>2 · Dónde y cuándo <span className="muted small">{city.trim() || "todo el país"}{remote ? " + remoto" : ""}</span></summary>
          <div className="bs-body">
            <div className="bs-grid">
              <label>Ciudad<input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ciudad" /></label>
              <label>Publicado
                <select value={jobage} onChange={(e) => setJobage(e.target.value)}>
                  <option value="">Cualquier fecha</option><option value="7">Última semana</option>
                  <option value="14">Últimas 2 semanas</option><option value="30">Último mes</option>
                </select>
              </label>
              <label>Experiencia máxima pedida
                <select value={expMax} onChange={(e) => setExpMax(e.target.value)}>
                  <option value="">Sin límite</option><option value="1">Hasta 1 año</option>
                  <option value="2">Hasta 2 años</option><option value="3">Hasta 3 años</option>
                </select>
              </label>
              <label className="bs-check"><input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} /> Incluir remoto</label>
            </div>
            <div className="bs-chips">
              {portals.map((p) => (
                <label key={p.id} className="bs-check"><input type="checkbox" checked={portalOn.has(p.id)} onChange={() => toggle(portalOn, p.id, setPortalOn)} /> {p.label} ({p.market})</label>
              ))}
            </div>
          </div>
        </details>

        <details className="bs-panel" open>
          <summary>3 · Filtros avanzados <span className="muted small">{useAdvanced ? "activos" : "desactivados"}</span></summary>
          <div className="bs-body">
            <label className="bs-check"><input type="checkbox" checked={useAdvanced} onChange={(e) => setUseAdvanced(e.target.checked)} /> Usar filtros avanzados (desmárcalo para ver todo lo que devuelven los portales)</label>
            <div className={`bs-grid ${useAdvanced ? "" : "off"}`}>
              <label>Debe incluir alguna de (separadas por coma)
                <input value={include} onChange={(e) => { setInclude(e.target.value); setAdvDirty(true) }} placeholder="react, python, sql" />
              </label>
              <label>Excluir del título (separadas por coma)
                <input value={exclude} onChange={(e) => { setExclude(e.target.value); setAdvDirty(true) }} placeholder="senior, líder, gerente" />
              </label>
              <label>Afinidad mínima
                <select value={minScore} onChange={(e) => setMinScore(e.target.value)}>
                  <option value="0">Todas</option><option value="30">30+</option><option value="50">50+</option><option value="70">70+ (alta)</option>
                </select>
              </label>
              <label className="bs-check"><input type="checkbox" checked={hideConf} onChange={(e) => setHideConf(e.target.checked)} /> Ocultar empresa confidencial</label>
            </div>
            <p className="muted small">Se aplican al instante sobre lo ya buscado. «Debe incluir» mira título y descripción; las ofertas aún sin analizar no se descartan por él.</p>
          </div>
        </details>

        <div className="bs-gobar">
          <button className="primary" type="submit" disabled={searching || portalOn.size === 0 || (chosen.length === 0 && !extra.trim() && !city.trim())}>{searching ? "Buscando…" : "Buscar"}</button>
          {portalChips.length > 0 && (
            <div className="bs-chips" title="Filtra los resultados ya cargados, sin volver a buscar">
              <span className="muted small">Ver:</span>
              {portalChips.map((p) => {
                const n = rows.filter((r) => r.portalId === p.portal).length
                return <button type="button" key={p.portal} className={`chip ${hidden.has(p.portal) ? "" : "on"}`} aria-pressed={!hidden.has(p.portal)} onClick={() => { toggle(hidden, p.portal, setHidden); setPages({}) }}>{p.label} {n}</button>
              })}
            </div>
          )}
        </div>
      </form>

      {message && <p className="muted bs-msg" role="status">{message}</p>}
      {analyzing && (
        <div className="bs-progress" role="status">
          <span className="muted small">Analizando experiencia y requisitos… {analyzing.done}/{analyzing.total}</span>
          <progress value={analyzing.done} max={analyzing.total} />
        </div>
      )}
      {results?.filter((p) => !p.ok || p.error).map((p) => <p key={p.portal} className="bs-err">{p.label}{p.ok ? " (parcial)" : ""}: {p.error}</p>)}

      {results && (
        <>
          <div className="bs-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "ok"} className={tab === "ok" ? "on" : ""} onClick={() => setTab("ok")}>Ofertas <span className="count">{kept}</span></button>
            <button role="tab" aria-selected={tab === "no"} className={tab === "no" ? "on" : ""} onClick={() => setTab("no")}>Descartadas <span className="count">{dropped.length}</span></button>
            <label className="bs-psize muted small">Por página
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPages({}) }}>
                {[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <p className="muted small bs-msg">{kept} de {rows.length} ofertas se quedan; {dropped.length} descartadas.</p>
          {tab === "ok" ? (
            chosen.length === 0 ? <p className="muted bs-msg">Elige al menos un perfil para puntuar las ofertas.</p>
              : chosen.map((p) => renderProfile(p, groups.get(p.id) ?? []))
          ) : dropped.length === 0 ? <p className="muted bs-msg">No se descartó ninguna oferta.</p> : (
            <div className="bs-tablewrap">
              <table>
                <thead><tr><th>Afin.</th><th>Oferta</th><th>Empresa</th><th>Ciudad</th><th>Portal</th><th>Motivo</th></tr></thead>
                <tbody>
                  {slice("no", dropped).map((d) => (
                    <tr key={d.row.url}>
                      <td>{d.score.total}</td>
                      <td>{safeUrl(d.row.url) ? <a href={d.row.url} target="_blank" rel="noopener noreferrer">{d.row.title}</a> : d.row.title}</td>
                      <td>{d.row.company ?? "—"}</td><td>{d.row.location ?? "—"}</td><td>{d.row.portal}</td><td className="bs-why">{d.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {renderPager("no", dropped.length)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

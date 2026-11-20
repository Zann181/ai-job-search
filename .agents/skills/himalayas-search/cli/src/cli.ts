#!/usr/bin/env bun
// CLI for Himalayas (himalayas.app). Remote jobs worldwide with seniority, salary and time-zone data. Search is done server-side, 20 offers per call.
// Public endpoint, no authentication, zero runtime dependencies, just `bun`.
// Personal use only. Keep volume low.

import { ES_EN, ageDays, fetchAll, geoOk, norm, plain, table, words, type JobCard } from "./commands/search.js"

const HELP = `himalayas-search — search remote/online jobs on Himalayas

USAGE
  bun run src/cli.ts search --query "<cargo>" [flags]

FLAGS
  --query, -q <text>      Job title / keywords. REQUIRED.
  --location, -l <text>   Keep offers a person in that place can take (remote-anywhere, LatAm or that place).
  --remote                Only offers marked remote (all of them are).
  --jobage <days>         Posted within N days.
  --limit, -n <n>         Cap results emitted (default 30).
  --format <fmt>          json (default) | table | plain.

Personal use only — keep volume low.
`

function parse(argv: string[]) {
  const f: Record<string, string | boolean> = {}
  const pos: string[] = []
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-")) {
      const k = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const nx = argv[i + 1]
      if (nx === undefined || nx.startsWith("-")) f[k] = true
      else (f[k] = nx), i++
    } else pos.push(a)
  }
  return { f, pos }
}
function fail(error: string, code: string): number {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
  return 1
}

async function main(): Promise<number> {
  const { f, pos } = parse(process.argv.slice(2))
  if (f.help || f.h || pos.length === 0) {
    process.stdout.write(HELP)
    return pos.length === 0 && !f.help && !f.h ? 1 : 0
  }
  if (pos[0] !== "search") return fail(`Unknown command "${pos[0]}"`, "BAD_CMD")
  const KNOWN = new Set(["query", "location", "remote", "jobage", "limit", "format", "help", "h"])
  for (const k of Object.keys(f)) if (!KNOWN.has(k)) return fail(`unknown flag --${k} - flags are never silently ignored; see --help`, "UNKNOWN_FLAG")
  const query = typeof f.query === "string" ? f.query.trim() : ""
  if (!query) return fail('the --query/-q flag is required (e.g. -q "data analyst")', "NO_QUERY")
  const fmt = f.format === undefined ? "json" : String(f.format)
  if (!["json", "table", "plain"].includes(fmt)) return fail(`--format must be json|table|plain, got "${fmt}"`, "BAD_ARG")
  const num = (name: string): number | undefined | "bad" => {
    if (f[name] === undefined) return undefined
    const v = typeof f[name] === "string" ? Number(String(f[name]).trim()) : NaN
    return Number.isInteger(v) && v >= 1 ? v : "bad"
  }
  const jobage = num("jobage")
  const limit = num("limit")
  if (jobage === "bad" || limit === "bad") return fail("--jobage and --limit must be whole numbers of at least 1", "BAD_ARG")
  if (f.location !== undefined && (typeof f.location !== "string" || !f.location.trim())) return fail("--location requires a non-empty value", "BAD_ARG")
  const location = typeof f.location === "string" ? f.location.trim() : ""

  try {
    const ws = words(query)
    const en = ws.map((w) => ES_EN[w]?.[0] ?? w).join(" ")
    let cards = await fetchAll(query, en)
    cards = cards.filter((c) => {
      const hay = norm(`${c.title} ${c.company ?? ""} ${c.description ?? ""}`)
      return ws.every((w) => [w, ...(ES_EN[w] ?? [])].some((v) => hay.includes(v)))
    })
    if (location) cards = cards.filter((c) => geoOk(c.location, location))
    if (f.remote === true) cards = cards.filter((c) => c.remote)
    if (jobage !== undefined) cards = cards.filter((c) => { const a = ageDays(c.date); return a !== null && a <= jobage })
    const th = (c: JobCard) => (ws.some((w) => [w, ...(ES_EN[w] ?? [])].some((v) => norm(c.title).includes(v))) ? 1 : 0)
    cards = cards.map((c, i) => ({ c, i })).sort((a, b) => th(b.c) - th(a.c) || a.i - b.i).map((x) => x.c)
    const total = cards.length
    cards = cards.slice(0, limit ?? 30)
    if (fmt === "table") process.stdout.write(table(cards) + "\n")
    else if (fmt === "plain") process.stdout.write(plain(cards) + "\n")
    else process.stdout.write(JSON.stringify({ meta: { count: cards.length, total }, results: cards }, null, 2) + "\n")
    return 0
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
  }
}

main().then((c) => process.exit(c)).catch((e) => { fail(e instanceof Error ? e.message : String(e), "INTERNAL_ERROR"); process.exit(1) })

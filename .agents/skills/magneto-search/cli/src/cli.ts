#!/usr/bin/env bun
// Self-contained CLI for searching jobs on Magneto365 Colombia
// (www.magneto365.com). No external CLI framework, so it runs anywhere `bun`
// is available with zero install beyond the repo clone.
//
// Limited by design: robots.txt forbids the portal's query-string search, so
// this reads Magneto's job-title and city landing pages (20 newest
// offers each) and filters them client-side. Personal use only; keep volume low.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { slugify } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `magneto-cli — search jobs on Magneto365 Colombia (www.magneto365.com)

USAGE
  bun run src/cli.ts search [--query "<cargo>"] [--location "<ciudad>"] [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Job title / keywords. Matched to Magneto's job-title taxonomy when
                          possible; otherwise used to filter titles on the chosen page.
  --location, -l <text>   City, e.g. "Bogotá", "Medellín", "Cali". Reads the city page, or
                          filters by city when a job-title page is used.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

  Each landing page shows its 20 newest offers; there is no paging and no
  posting-age filter (--page and --jobage are not supported).

EXAMPLES
  bun run src/cli.ts search -q "desarrollador" --format table
  bun run src/cli.ts search -q "auxiliar contable" -l "Medellín" --format table
  bun run src/cli.ts search -q "soporte" -l "Bogotá" --format plain
  bun run src/cli.ts detail desarrollador-ecommerce-1114167 --format plain

Personal use only — keep volume low.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

function fail(error: string, code: string): number {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
  return 1
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    // Explain the two contract flags this portal cannot honour, rather than a generic unknown-flag error.
    if (flags.page !== undefined && flags.page !== "1") {
      return fail("--page is not supported: Magneto only serves the 20 newest offers of each landing page without a query string, and robots.txt forbids the rest", "PAGE_UNSUPPORTED")
    }
    delete flags.page
    if (flags.jobage !== undefined) {
      return fail("--jobage is not supported: Magneto listing pages carry no posting date (use detail for datePosted)", "JOBAGE_UNSUPPORTED")
    }
  }

  // Unknown flags are rejected, never silently discarded: a dropped filter
  // changes what the search returns with no error.
  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      return fail(
        `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns; see --help for the supported flags`,
        "UNKNOWN_FLAG",
      )
    }
  }

  if (cmd === "search") {
    for (const name of ["query", "location"]) {
      const v = flags[name]
      if (v !== undefined && (typeof v !== "string" || !slugify(v))) {
        return fail(`--${name} requires a non-empty value`, "BAD_ARG")
      }
    }
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "table", "plain"].includes(fmt)) {
      return fail(`--format must be one of json|table|plain, got "${fmt}"`, "BAD_ARG")
    }
    let limit: number | undefined
    if (flags.limit !== undefined) {
      // Number(), not parseInt(): parseInt truncates "0.5" to 0. Whole numbers >= 1 only.
      const val = typeof flags.limit === "string" ? Number(flags.limit.trim()) : NaN
      if (!Number.isInteger(val) || val < 1) {
        return fail(`--limit must be a whole number of at least 1, got "${flags.limit}"`, "BAD_ARG")
      }
      limit = val
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      limit,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) return fail("detail requires an <id|url>", "NO_ID")
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "plain"].includes(fmt)) {
      return fail(`--format must be one of json|plain, got "${fmt}"`, "BAD_ARG")
    }
    const opts: DetailOpts = { id, format: fmt as DetailOpts["format"] }
    return runDetail(opts)
  }

  return fail(`Unknown command "${cmd}"`, "BAD_CMD")
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })

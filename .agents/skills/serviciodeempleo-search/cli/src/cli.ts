#!/usr/bin/env bun
// CLI for the Servicio Público de Empleo de Colombia
// (buscadordeempleo.gov.co): the official public-employment aggregator that
// carries the SENA Agencia Pública de Empleo and the cajas de compensación
// (Comfama, Colsubsidio, Cafam, Comfenalco, ...). No authentication, zero
// runtime dependencies, just `bun`.
//
// Personal use only. Keep volume low.

import { fail, writeError, type Flags } from "./helpers.js"
import { search } from "./commands/search.js"
import { detail } from "./commands/detail.js"

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) flags[key] = true
      else {
        flags[key] = next
        i++
      }
    } else (flags._ as string[]).push(a)
  }
  return flags
}

const HELP = `serviciodeempleo-cli — search jobs on the Servicio Público de Empleo (buscadordeempleo.gov.co)

USAGE
  bun run src/cli.ts search --query "<cargo>" [flags]
  bun run src/cli.ts detail <codigo|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Job title / keywords. REQUIRED. e.g. "analista de datos".
  --location, -l <text>   City, e.g. "Bogotá", "Medellín", "Cali". Omit for all of Colombia.
  --remote                Only offers flagged as teletrabajo.
  --jobage <days>         Posted within N days.
  --page <n>              1-indexed API page (50 offers per page, newest first). Default 1.
  --limit, -n <n>         Cap results emitted.
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "desarrollador" -l "Medellín" --jobage 14 --format table
  bun run src/cli.ts search -q "analista de datos" --remote
  bun run src/cli.ts detail 1626427399-24 --format plain

Personal use only — keep volume low.
`

const KNOWN = {
  search: new Set(["query", "location", "remote", "jobage", "page", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
} as const

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]
  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }
  if (cmd !== "search" && cmd !== "detail") return fail(`Unknown command "${cmd}"`, "BAD_CMD")
  // Unknown flags are rejected, never silently dropped: a discarded filter changes what comes back.
  for (const key of Object.keys(flags)) {
    if (key === "_" || KNOWN[cmd].has(key)) continue
    return fail(`unknown flag --${key} for '${cmd}' - flags are never silently ignored; see --help`, "UNKNOWN_FLAG")
  }
  return cmd === "search" ? search(flags) : detail(flags)
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    writeError(e instanceof Error ? e.message : String(e), "INTERNAL_ERROR")
    process.exit(1)
  })

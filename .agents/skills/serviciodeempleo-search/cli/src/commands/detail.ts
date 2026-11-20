// Detail command: one offer by its "<sede>-<proceso>" code or detalle_oferta URL.
import { apiGet, fail, toCard, type Flags } from "../helpers.js"
import type { Page } from "./search.js"

export async function detail(flags: Flags): Promise<number> {
  const raw = (flags._ as string[])[1]
  if (!raw) return fail("detail requires a <codigo|url>", "NO_ID")
  const fmt = flags.format !== undefined ? String(flags.format) : "json"
  if (!["json", "plain"].includes(fmt)) return fail(`--format must be one of json|plain, got "${fmt}"`, "BAD_ARG")
  // The offer code is "<sede>-<proceso>" (e.g. 1626427399-24); a detail URL carries the same pair.
  let code = raw
  const m = /sede_id=(\d+)&proceso_id=(\d+)/i.exec(raw)
  if (m) code = `${m[1]}-${m[2]}`
  if (!/^\d+-\d+$/.test(code)) return fail(`"${raw}" is not an offer code like 1626427399-24 or a detalle_oferta URL`, "BAD_ID")
  try {
    const res: Page = await apiGet("/vacantes/resultados", { page: "1", CODIGO_VACANTE: code })
    const row = res.resultados?.[0]
    if (!row) return fail(`offer ${code} not found (it may have expired)`, "NOT_FOUND")
    const card = toCard(row)
    if (fmt === "plain") {
      process.stdout.write(
        [card.title, `${card.company ?? "—"} · ${card.location ?? "—"}${card.remote ? " (remoto)" : ""}`, card.url, "", card.description ?? "(no description)"].join("\n") + "\n",
      )
    } else process.stdout.write(JSON.stringify(card, null, 2) + "\n")
    return 0
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
  }
}

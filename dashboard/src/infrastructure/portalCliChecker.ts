// PostingChecker that re-fetches a posting with its portal CLI (no model involved).
import { existsSync } from "node:fs"
import { join } from "node:path"
import type { Posting, TrackingCheck } from "../domain/job"
import type { PostingChecker } from "../domain/ports"
import { ROOT } from "./files"

async function detail(portal: string, url: string): Promise<any> {
  const cli = join(ROOT, ".agents", "skills", portal, "cli", "src", "cli.ts")
  if (!existsSync(cli)) throw new Error(`sin CLI para ${portal}`)
  const proc = Bun.spawn(["bun", "run", cli, "detail", url, "--format", "json"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  if (code !== 0) {
    let msg = err.trim()
    try { msg = JSON.parse(msg).error ?? msg } catch { /* keep raw */ }
    throw new Error(msg.slice(0, 200) || `exit ${code}`)
  }
  return out.trim() ? JSON.parse(out) : null
}

export class PortalCliChecker implements PostingChecker {
  async check(p: Posting): Promise<TrackingCheck> {
    const date = new Date().toISOString()
    try {
      const d = await detail(p.portal, p.url)
      const deadline = d?.validThrough ? String(d.validThrough).slice(0, 10) : p.deadline
      const pastDeadline = deadline ? deadline < date.slice(0, 10) : false
      // An empty detail (removed page), LinkedIn's closed banner or a passed deadline read as closed.
      const open = !(d == null || d.isActive === false || pastDeadline)
      return { date, open, applicants: d?.applicants ?? null, deadline, salary: d?.salary ?? null }
    } catch (e) {
      return { date, open: null, applicants: null, deadline: p.deadline, salary: null, error: String((e as Error).message ?? e) }
    }
  }
}

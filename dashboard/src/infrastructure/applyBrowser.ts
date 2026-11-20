// The browser Chrome applications run in: the candidate's own Brave, with the portal
// logins it already has. chrome-devtools-mcp attaches to it over the DevTools
// WebSocket that Brave opens once remote debugging is switched on at
// brave://inspect/#remote-debugging. Brave asks the candidate to allow each connection.
//
// Chromium refuses --remote-debugging-port on a default profile, so this never
// relaunches Brave with flags: it reads the DevToolsActivePort file Brave writes
// in its user-data folder and hands that endpoint to the MCP server.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { connect } from "node:net"
import { join } from "node:path"
import type { ApplyBrowser } from "../domain/ports"
import { ROOT } from "./files"

/** Pinned: a floating @latest would change the tools Claude is allowed to call between runs. */
const MCP_PACKAGE = "chrome-devtools-mcp@1.10.1"
const LOCAL = process.env.LOCALAPPDATA ?? ""
const BRAVE_EXE = [
  process.env.BRAVE_PATH,
  "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  "C:/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe",
  `${LOCAL}/BraveSoftware/Brave-Browser/Application/brave.exe`,
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/usr/bin/brave-browser",
].filter(Boolean) as string[]
const USER_DATA = process.env.BRAVE_USER_DATA ?? join(LOCAL, "BraveSoftware", "Brave-Browser", "User Data")

export const SETUP_URL = "brave://inspect/#remote-debugging"

function portOpen(port: number): Promise<boolean> {
  return new Promise((done) => {
    const s = connect({ host: "127.0.0.1", port, timeout: 1000 })
    s.once("connect", () => { s.destroy(); done(true) })
    s.once("error", () => done(false))
    s.once("timeout", () => { s.destroy(); done(false) })
  })
}

export class BraveApplyBrowser implements ApplyBrowser {
  /** Path of the MCP config handed to `claude --mcp-config`; rewritten before each run. */
  readonly mcpConfig: string

  constructor(configDir: string) {
    mkdirSync(configDir, { recursive: true })
    this.mcpConfig = join(configDir, "mcp-apply-browser.json")
  }

  /** ws:// endpoint from DevToolsActivePort, or null when remote debugging is off or Brave is closed. */
  private async endpoint(): Promise<string | null> {
    const file = join(USER_DATA, "DevToolsActivePort")
    if (!existsSync(file)) return null
    const [port, path] = readFileSync(file, "utf-8").split(/\r?\n/)
    if (!/^\d+$/.test(port ?? "") || !path?.startsWith("/devtools/browser/")) return null
    return (await portOpen(Number(port))) ? `ws://127.0.0.1:${port}${path}` : null
  }

  async running() { return (await this.endpoint()) != null }

  /** Opens a URL as a tab in Brave (starting it if closed). */
  async open(url?: string) {
    if (url && !/^https:\/\//.test(url) && url !== SETUP_URL) throw new Error("Solo se abren direcciones https.")
    const exe = BRAVE_EXE.find((p) => existsSync(p))
    if (!exe) throw new Error("No encontré Brave. Instálalo o define BRAVE_PATH.")
    const target = url ?? ((await this.running()) ? null : SETUP_URL)
    if (!target) return
    Bun.spawn([exe, target], { stdout: "ignore", stderr: "ignore", stdin: "ignore" }).unref()
  }

  async ensure() {
    const ws = await this.endpoint()
    if (!ws) {
      await this.open(SETUP_URL).catch(() => {})
      throw new Error(`Brave no tiene la depuración remota activa. En la pestaña ${SETUP_URL} que se abrió, actívala y vuelve a postular.`)
    }
    const args = [
      "-y", MCP_PACKAGE,
      `--wsEndpoint=${ws}`,
      // Uploads may read only the tailored documents.
      `--filesystemRoot=${join(ROOT, "cv")}`,
      `--filesystemRoot=${join(ROOT, "cover_letters")}`,
      // Forms are filled with fill/click/upload; page scripts are never needed.
      "--javascriptEvaluation=false",
      "--fileNavigations=false",
      "--categoryPerformance=false",
      "--categoryEmulation=false",
      "--usageStatistics=false",
      "--performanceCrux=false",
    ]
    const server = process.platform === "win32" ? { command: "cmd", args: ["/c", "npx", ...args] } : { command: "npx", args }
    writeFileSync(this.mcpConfig, JSON.stringify({ mcpServers: { "chrome-devtools": { ...server, env: { CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1" } } } }, null, 1))
  }
}

// AgentRunner over headless Claude Code (`claude -p`, stream-json output).
import type { AgentEvent, AgentRunner } from "../domain/ports"
import type { ModelTier, TaskDefinition } from "../domain/task"
import { ROOT, cvSourceDir } from "./files"

function describe(event: any): AgentEvent | null {
  if (event.type === "assistant") {
    const text = (event.message?.content ?? [])
      .map((c: any) => (c.type === "text" ? c.text : c.type === "tool_use" ? `→ ${c.name} ${JSON.stringify(c.input).slice(0, 160)}` : ""))
      .filter(Boolean)
      .join("\n")
    return text ? { text } : null
  }
  if (event.type === "result") return { result: event.result, cost_usd: event.total_cost_usd, text: `Fin (${event.subtype})` }
  return null
}

export class ClaudeCliRunner implements AgentRunner {
  /** mcpConfig: MCP servers for browser tasks; strict so no other server is loaded into them. */
  constructor(private mcpConfig: string) {}

  async run(def: TaskDefinition, model: ModelTier, prompt: string, onEvent: (e: AgentEvent) => void) {
    const args = ["claude", "-p", prompt, "--model", model, "--output-format", "stream-json", "--verbose", "--allowedTools", def.tools.join(",")]
    if (def.acceptEdits) args.push("--permission-mode", "acceptEdits")
    // The candidate's CV data lives outside a worktree: let the headless run read it.
    const cvDir = cvSourceDir()
    if (cvDir) args.push("--add-dir", cvDir)
    if (def.browser) args.push("--mcp-config", this.mcpConfig, "--strict-mcp-config")
    const proc = Bun.spawn(args, {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
      // Subagents inherit the task's tier, so a /rank or /apply run never escalates to Opus.
      env: { ...process.env, CLAUDE_CODE_SUBAGENT_MODEL: model, PYTHONIOENCODING: "utf-8" },
    })
    const decoder = new TextDecoder()
    let buf = ""
    for await (const chunk of proc.stdout) {
      buf += decoder.decode(chunk, { stream: true })
      let nl: number
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        try {
          const e = describe(JSON.parse(line))
          if (e) onEvent(e)
        } catch { onEvent({ text: line }) }
      }
    }
    const code = await proc.exited
    const err = (await new Response(proc.stderr).text()).trim()
    if (err) onEvent({ text: err.slice(-2000) })
    return code
  }
}

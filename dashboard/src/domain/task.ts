// Agent tasks and the model policy: each task picks a model by how hard the
// work is. Opus is excluded by construction, since ModelTier has no such value.

export type ModelTier = "haiku" | "sonnet"

export type TaskType = "scrape" | "rank" | "apply" | "critique" | "chrome"

export type Difficulty = "mecanica" | "juicio" | "redaccion" | "navegador"

export interface TaskDefinition {
  type: TaskType
  label: string
  difficulty: Difficulty
  needsJob: boolean
  /** Tools on top of the project allowlist; a headless session denies everything else. */
  tools: string[]
  acceptEdits: boolean
  /** Runs with the chrome-devtools MCP attached to the dedicated application browser. */
  browser: boolean
}

const MODEL_BY_DIFFICULTY: Record<Difficulty, ModelTier> = {
  mecanica: "haiku", // run CLIs, dedupe, store
  juicio: "sonnet", // score and critique postings
  redaccion: "sonnet", // tailored CV and cover letter
  navegador: "sonnet", // form filling with unexpected questions
}

export const modelFor = (d: TaskDefinition): ModelTier => MODEL_BY_DIFFICULTY[d.difficulty]

const READ = ["Read", "Glob", "Grep", "WebFetch", "WebSearch"]

export const TASK_DEFINITIONS: Record<TaskType, TaskDefinition> = {
  scrape: { type: "scrape", label: "Buscar ofertas", difficulty: "mecanica", needsJob: false, tools: [...READ, "Write", "Agent", "Skill"], acceptEdits: true, browser: false },
  rank: { type: "rank", label: "Puntuar ofertas", difficulty: "juicio", needsJob: false, tools: [...READ, "Write", "Agent", "Skill"], acceptEdits: true, browser: false },
  apply: {
    type: "apply", label: "Generar CV y carta", difficulty: "redaccion", needsJob: true, acceptEdits: true, browser: false,
    tools: [...READ, "Write", "Edit", "Agent", "Skill", "Bash(lualatex:*)", "Bash(xelatex:*)", "Bash(pdflatex:*)", "Bash(mkdir -p build)", "Bash(mv build/:*)",
      "Bash(cd cv)", "Bash(cd cover_letters)", "Bash(python tools/posting_guard.py:*)", "Bash(python tools/verify_pdf.py:*)", "Bash(python tools/verify_layout.py:*)", "Bash(git diff --no-index:*)"],
  },
  critique: { type: "critique", label: "Crítica de probabilidad", difficulty: "juicio", needsJob: true, tools: READ, acceptEdits: false, browser: false },
  chrome: { type: "chrome", label: "Postular con Chrome", difficulty: "navegador", needsJob: true, tools: ["Read", "mcp__chrome-devtools"], acceptEdits: false, browser: true },
}

export type TaskStatus = "queued" | "running" | "done" | "error"

export interface Task {
  id: string
  type: TaskType
  key?: string
  model: ModelTier
  label: string
  status: TaskStatus
  created: string
  finished?: string
  cost_usd?: number
  log: string[]
  result?: string
  /** Chrome runs: whether the application was sent and how many new questions it found. */
  outcome?: { sent: boolean; ready?: boolean; newQuestions: number; reason: string }
}

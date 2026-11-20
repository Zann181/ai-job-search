// Ports the application layer depends on; infrastructure implements them.
import type { CvProfile, MarkedOffer, OfferDetail, PortalInfo, PortalResult, SearchParams } from "./search"
import type { ApplicationRecord, JobPreferences, Posting, TrackerStatus, TrackingCheck } from "./job"
import type { TaskDefinition, ModelTier } from "./task"
import type { CompileResult, DocKind } from "./document"
import type { Answer } from "./answer"

export interface AnswerStore {
  all(): Answer[]
  upsert(question: string, answer: string, seenIn?: string): Answer
  addPending(questions: string[], seenIn: string): void
  remove(question: string): void
}

export interface DocumentStore {
  read(texPath: string): string
  write(texPath: string, content: string): void
}

export interface DocumentCompiler {
  /** pageLimit overrides the limit derived from the document kind (the role templates are 1 page). */
  compile(texPath: string, kind: DocKind, pageLimit?: number): Promise<CompileResult>
}

/** Dedicated Chrome window that application tasks drive through chrome-devtools-mcp. */
export interface ApplyBrowser {
  running(): Promise<boolean>
  open(url?: string): Promise<void>
  ensure(): Promise<void>
}

export interface PostingCatalog {
  all(): Posting[]
  get(key: string): Posting | null
}

export interface ApplicationTracker {
  recordFor(p: Posting): ApplicationRecord
  setStatus(p: Posting, status: TrackerStatus): void
}

export interface PreferenceStore {
  all(): Record<string, JobPreferences>
  get(key: string): JobPreferences
  patch(key: string, patch: Partial<JobPreferences>): JobPreferences
  lastAutoCheck(): string | null
  setLastAutoCheck(iso: string): void
}

export interface PostingChecker {
  check(p: Posting): Promise<TrackingCheck>
}

export interface AgentEvent {
  text?: string
  result?: string
  cost_usd?: number
}

export interface AgentRunner {
  run(def: TaskDefinition, model: ModelTier, prompt: string, onEvent: (e: AgentEvent) => void): Promise<number>
}

/** Live search over the job portals. */
export interface OfferSearcher {
  portals(): PortalInfo[]
  search(params: SearchParams): Promise<PortalResult[]>
  detail(portal: string, url: string): Promise<OfferDetail | null>
}

export interface ProfileSource {
  list(): CvProfile[]
}

/** Offers marked by hand to apply to; they join the job catalog. */
export interface MarkedOfferStore {
  add(offer: MarkedOffer): string
}

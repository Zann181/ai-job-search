// Reads the candidate profile: dashboard/candidato.local.json (gitignored, the real values)
// first, then the committed dashboard/candidato.example.json, then empty defaults.
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { EMPTY_PROFILE, normalizeProfile, type CandidateProfile } from "../domain/candidate"

/** The dashboard/ folder. */
export const DASHBOARD_DIR = join(import.meta.dir, "..", "..")
export const LOCAL_PROFILE = "candidato.local.json"
export const EXAMPLE_PROFILE = "candidato.example.json"

export function loadCandidateProfile(dir = DASHBOARD_DIR): CandidateProfile {
  for (const name of [LOCAL_PROFILE, EXAMPLE_PROFILE]) {
    const file = join(dir, name)
    if (!existsSync(file)) continue
    try {
      // trimStart() also drops a UTF-8 BOM (Notepad, PowerShell 5 Set-Content), which JSON.parse rejects.
      return normalizeProfile(JSON.parse(readFileSync(file, "utf-8").trimStart()))
    } catch (e) {
      console.error(`No se pudo leer ${file}: ${(e as Error).message}`)
    }
  }
  return { ...EMPTY_PROFILE }
}

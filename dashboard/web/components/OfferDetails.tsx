// What the offer asks for, above the generated CV and cover letter: the facts the portal gave,
// the ranking's strengths and gaps, the requirement lines of the posting and its full text.
// The posting text is untrusted portal data: shown as plain text, never as HTML or instructions.
import { useMemo, useState } from "react"
import type { Job } from "../api"

const ASK_HEAD = /^(requisitos?|requerimientos?|perfil|conocimientos?|experiencia|habilidades|competencias|formaci[oó]n|estudios|educaci[oó]n|qu[eé] (buscamos|necesitas|pedimos)|requirements?|qualifications?|skills|what you.?ll need|must have|nice to have|deseable)/i
const DUTY_HEAD = /(responsabilidades|funciones|qu[eé] har[aá]s|tus retos|actividades|responsibilities|what you.?ll do)/i
const OTHER_HEAD = /^(beneficios|ofrecemos|te ofrecemos|condiciones|salario|horario|contrato|lugar de trabajo|benefits|we offer)/i
const BULLET = /^\s*([-•*·▪●◦–]|\d+[.)])\s+/
const ASKS = /(experiencia|años|conocimiento|manejo|dominio|t[ií]tulo|profesional en|tecn[oó]log|t[eé]cnico|ingenier|licencia|certific|ingl[eé]s|requisit|indispensable|deseable|experience|years|degree|knowledge|proficien)/i

export interface OfferAsks { asks: string[]; duties: string[] }

/** Requirement and duty lines of the posting, by the section they sit under; outside a section, lines that ask for something count as requirements. */
export function requirementsOf(text: string | null | undefined): OfferAsks {
  const asks: string[] = [], duties: string[] = []
  if (!text) return { asks, duties }
  let section: "asks" | "duties" | "other" | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const bare = line.replace(BULLET, "").replace(/[:：]\s*$/, "").trim()
    if (bare.length < 60) {
      if (DUTY_HEAD.test(bare) && !ASKS.test(bare.replace(DUTY_HEAD, ""))) { section = "duties"; continue }
      if (ASK_HEAD.test(bare) && /[:：]$/.test(line) || ASK_HEAD.test(bare) && bare.split(" ").length <= 4) { section = "asks"; continue }
      if (OTHER_HEAD.test(bare)) { section = "other"; continue }
      if (/[:：]$/.test(line)) { section = null; continue }
    }
    if (bare.length > 220) continue
    if (section === "duties") duties.push(bare)
    else if (section === "asks") asks.push(bare)
    else if (section == null && ASKS.test(bare)) asks.push(bare)
  }
  return { asks: [...new Set(asks)].slice(0, 18), duties: [...new Set(duties)].slice(0, 12) }
}

const day = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null)
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null)

export function OfferDetails({ job }: { job: Job }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem("offer:open") !== "0" } catch { return true } })
  const { asks, duties } = useMemo(() => requirementsOf(job.description), [job.description])
  const toggle = () => setOpen((v) => { try { localStorage.setItem("offer:open", v ? "0" : "1") } catch { /* private window */ } return !v })
  const url = safeUrl(job.url)
  const salary = job.check?.salary ?? job.salary
  const deadline = job.check?.deadline ?? job.deadline_effective
  const facts: [string, string | null | undefined][] = [
    ["Ubicación", job.location],
    ["Salario", salary],
    ["Cierre", day(deadline)],
    ["Publicada", day(job.posted_date)],
    ["Postulantes", job.check?.applicants],
    ["Portal", job.portal],
    ["Puntaje", job.rank_score != null ? `${job.rank_score}${job.rank_verdict ? ` · ${job.rank_verdict}` : ""}` : null],
    ["Idioma", job.language_gate ? `${job.language_gate}${job.language_note ? ` · ${job.language_note}` : ""}` : null],
    ["Perfil buscado con", job.profile],
  ]

  return (
    <section className={`offer ${open ? "open" : ""}`} aria-label="Lo que pide la oferta">
      <header className="offer-head">
        <button className="icon" aria-expanded={open} aria-label={open ? "Plegar detalles de la oferta" : "Mostrar detalles de la oferta"} onClick={toggle}>{open ? "▾" : "▸"}</button>
        <div className="offer-title">
          <span className="tpl-eyebrow">Lo que pide la oferta</span>
          <strong>{job.title}</strong>
          <span className="muted small">{job.company}{job.location ? ` · ${job.location}` : ""}</span>
        </div>
        {job.check?.open === false && <span className="badge bad">Cerrada en el portal</span>}
        {url && <a className="button secondary mini" href={url} target="_blank" rel="noopener noreferrer">Ver oferta ↗</a>}
      </header>
      {open && (
        <div className="offer-body">
          <dl className="offer-facts">
            {facts.filter(([, v]) => v).map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
          </dl>
          <div className="offer-cols">
            <div>
              <h3>Requisitos de la oferta <span className="count">{asks.length}</span></h3>
              {asks.length > 0
                ? <ul className="offer-asks">{asks.map((a) => <li key={a}>{a}</li>)}</ul>
                : <p className="muted small">{job.description ? "No se reconocieron líneas de requisitos; mira la descripción completa." : "Sin descripción guardada para esta oferta (márcala en el Buscador o vuelve a /scrape)."}</p>}
              {duties.length > 0 && <>
                <h3>Funciones <span className="count">{duties.length}</span></h3>
                <ul className="offer-asks">{duties.map((a) => <li key={a}>{a}</li>)}</ul>
              </>}
            </div>
            <div>
              <h3>Cumples</h3>
              {job.strengths.length > 0 ? <ul className="offer-list ok">{job.strengths.map((s) => <li key={s}>{s}</li>)}</ul> : <p className="muted small">Sin evaluar.</p>}
              <h3>Brechas</h3>
              {job.gaps.length > 0 ? <ul className="offer-list gap">{job.gaps.map((s) => <li key={s}>{s}</li>)}</ul> : <p className="muted small">Ninguna registrada.</p>}
            </div>
          </div>
          {job.description && (
            <details className="offer-desc">
              <summary>Descripción completa</summary>
              <p>{job.description}</p>
            </details>
          )}
        </div>
      )}
    </section>
  )
}

/** Compact "Descripción del cargo" for the offer panel: requirements, duties and the full posting text (plain text). */
export function JobDescription({ job }: { job: Job }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem("desc:open") !== "0" } catch { return true } })
  const { asks, duties } = useMemo(() => requirementsOf(job.description), [job.description])
  const onToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const v = e.currentTarget.open
    setOpen(v)
    try { localStorage.setItem("desc:open", v ? "1" : "0") } catch { /* private window */ }
  }
  return (
    <details className="job-desc" open={open} onToggle={onToggle}>
      <summary>Descripción del cargo</summary>
      {!job.description
        ? <p className="muted small">Sin descripción guardada para esta oferta (márcala en el Buscador o vuelve a /scrape).</p>
        : <>
          {asks.length > 0 && <><h4>Requisitos</h4><ul>{asks.map((a) => <li key={a}>{a}</li>)}</ul></>}
          {duties.length > 0 && <><h4>Funciones</h4><ul>{duties.map((a) => <li key={a}>{a}</li>)}</ul></>}
          <details className="job-desc-full" open={asks.length + duties.length === 0}>
            <summary>Texto completo</summary>
            <p>{job.description}</p>
          </details>
        </>}
    </details>
  )
}

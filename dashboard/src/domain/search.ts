// Portal search: what the Buscador tab asks for and what it gets back.

export interface PortalInfo {
  id: string
  label: string
  market: string
  /** Portals ticked when the tab opens. */
  defaultOn: boolean
}

/** One search pass: a query (and city) run on a portal. */
export interface SearchPass {
  q: string
  loc: string
  /** No city was applied: the offer must prove it is remote or in the city. */
  unverifiedLocation: boolean
}

export interface SearchParams {
  queries: string[]
  city: string
  /** Also search without a city, to find remote offers. */
  remote: boolean
  jobage: number | null
  portals: string[]
}

/** A card as the portal CLIs return it, tagged with the pass that found it. */
export interface Offer {
  url: string
  title: string
  company: string | null
  location: string | null
  salary?: string | null
  date?: string | null
  dateText?: string | null
  query: string
  unverifiedLocation: boolean
}

export interface PortalResult {
  portal: string
  label: string
  ok: boolean
  error?: string
  results: Offer[]
}

export interface OfferDetail {
  description: string
  remote: boolean
}

/** One search profile taken from a CV: the role and the keywords the CV declares. */
export interface CvProfile {
  id: string
  role: string
  keywords: string[]
  /** Titles to search for this profile. */
  queries: string[]
  source: string
}

/** An offer the candidate marked to apply to. */
export interface MarkedOffer {
  url: string
  title: string
  company: string
  location: string
  portal: string
  score: number
  profile: string
  description: string
}

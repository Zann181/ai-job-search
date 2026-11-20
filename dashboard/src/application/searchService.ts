// Use cases of the Buscador tab: search portals, read postings, and mark an offer
// to apply to (it becomes a followed job and enters the CV / apply pipeline).
import type { Job } from "../domain/job"
import type { MarkedOfferStore, OfferSearcher, ProfileSource } from "../domain/ports"
import type { MarkedOffer, SearchParams } from "../domain/search"
import type { JobService } from "./jobService"

export class SearchService {
  constructor(
    private searcher: OfferSearcher,
    private profiles: ProfileSource,
    private marked: MarkedOfferStore,
    private jobs: JobService,
  ) {}

  portals() { return this.searcher.portals() }
  cvProfiles() { return this.profiles.list() }
  detail(portal: string, url: string) { return this.searcher.detail(portal, url) }

  search(params: SearchParams) {
    const portals = params.portals.filter((p) => this.searcher.portals().some((x) => x.id === p))
    if (portals.length === 0) throw new Error("Elige al menos un portal.")
    if (params.queries.length === 0 && !params.city) throw new Error("Elige un perfil o escribe un cargo o una ciudad.")
    return this.searcher.search({ ...params, portals })
  }

  /** Marks the offer: stored in the catalog and followed, ready for "Generar CV". */
  mark(offer: MarkedOffer): Job {
    if (!/^https:\/\//i.test(offer.url)) throw new Error("La oferta no tiene un enlace https válido.")
    if (!offer.title.trim()) throw new Error("La oferta no tiene título.")
    const key = this.marked.add(offer)
    return this.jobs.select(key, true)
  }

  unmark(key: string): Job {
    return this.jobs.select(key, false)
  }
}

// Salary text parsing for the floor check; no browser APIs, so tests can import it.

/** Highest COP amount in a salary text ("$ 1.423.500,00", "1,8 a 2,5 millones"); null if none. */
export function topSalary(text: string | null | undefined): number | null {
  if (!text) return null
  const millions = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:millones|millón|M(?![a-z]))/gi)].map((m) => Number(m[1].replace(",", ".")) * 1e6)
  const plain = [...text.matchAll(/\d{1,3}(?:[.\s]\d{3})+|\d{6,}/g)].map((m) => Number(m[0].replace(/[.\s]/g, "")))
  const all = [...millions, ...plain].filter((n) => n >= 100_000)
  return all.length ? Math.max(...all) : null
}

/** True when the posted salary tops out below the floor; false when either is unknown. */
export function belowFloor(text: string | null | undefined, floor: number | null | undefined): boolean {
  if (!floor || floor <= 0) return false
  const top = topSalary(text)
  return top !== null && top < floor
}

/** "$2.000.000" for the floor warning. */
export const formatCop = (n: number) => "$" + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")

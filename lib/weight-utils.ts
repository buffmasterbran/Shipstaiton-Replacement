/**
 * Weight conversion utilities.
 * Database stores weight as a single float in pounds (weightLbs).
 * UI displays/inputs weight as lb + oz.
 */

/** Convert decimal pounds to { lb, oz } */
export function lbsToLbOz(lbs: number): { lb: number; oz: number } {
  const totalOz = lbs * 16
  const lb = Math.floor(totalOz / 16)
  const oz = Math.round((totalOz % 16) * 10) / 10
  return { lb, oz }
}

/** Convert lb + oz back to decimal pounds */
export function lbOzToLbs(lb: number, oz: number): number {
  return lb + oz / 16
}

/** Format a weight in lbs as a display string like "1 lb 4.8 oz" */
export function formatWeight(lbs: number): string {
  if (!lbs || lbs <= 0) return '0 oz'
  const { lb, oz } = lbsToLbOz(lbs)
  if (lb === 0) return `${oz} oz`
  if (oz === 0) return `${lb} lb`
  return `${lb} lb ${oz} oz`
}

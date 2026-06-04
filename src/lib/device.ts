/**
 * True on phone-sized touch devices: a coarse pointer AND a small device
 * (shortest screen edge ≤ 480px). Excludes tablets and touch laptops. Used to
 * redirect phones away from the interactive talk deck (→ PDF) and the full
 * sketcher editor (→ the minimal /sketch).
 */
export function isPhone(): boolean {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const small = Math.min(window.screen.width, window.screen.height) <= 480
  return coarse && small
}

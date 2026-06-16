import { describe, it, expect } from 'vitest'
import { computeTHB } from './thb1d'

describe('1D THB construction', () => {
  for (const p of [1, 2, 3]) {
    it(`degree ${p}: THB sum = 1, HB sum bulges > 1 at the seam`, () => {
      // Refine a few interior cells so there are kept, straddling AND removed coarse fns.
      const a = p + 1
      const b = a + (p + 2)
      const d = computeTHB(p, a, b, 400)

      // Truncated (THB) basis is a partition of unity across the whole domain.
      const maxErr = Math.max(...d.sumTHB.map((v) => Math.abs(v - 1)))
      expect(maxErr).toBeLessThan(1e-6)

      // Non-truncated (HB) basis over-counts: the sum exceeds 1 somewhere.
      const maxHB = Math.max(...d.sumHB)
      expect(maxHB).toBeGreaterThan(1 + 1e-3)

      // There is at least one of each coarse status (so the demo is meaningful).
      const statuses = new Set(d.coarse.map((c) => c.status))
      expect(statuses.has('kept')).toBe(true)
      expect(statuses.has('straddling')).toBe(true)
      expect(statuses.has('removed')).toBe(true)

      // At least one straddling coarse function is actually truncated: it has some
      // active children (dropped by truncation) AND some inactive ones kept — i.e.
      // a genuine partial cut at the seam.
      const cut = d.coarse.filter(
        (c) => c.status === 'straddling' && c.children.some((ch) => ch.active) && c.children.some((ch) => !ch.active),
      )
      expect(cut.length).toBeGreaterThan(0)
      // And for such a function the truncated curve really differs from the full one.
      const c0 = cut[0]
      expect(Math.max(...c0.full.map((v, s) => Math.abs(v - c0.trunc[s])))).toBeGreaterThan(1e-3)
    })
  }
})

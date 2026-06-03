/**
 * DatasetGalaxy — all UIUC airfoils on one slide, faithful to Eric's original
 * shapeSpaceVisualizer.py (2012). Ring i ∈ {1..K} carries 4·2^i airfoils
 * (8, 16, 32, …, 1024 — last ring partial to total 1644), each scaled by
 * 0.75^i and placed at cumulative radius Σ_{k=1..i} 0.8^k. Within each ring,
 * a small initial rotation π/8/i breaks radial alignment between rings.
 * Airfoils are rotated WITH their angular position so the chord points
 * radially outward — the sunburst look of the original.
 *
 * Data: raw .dat polylines bundled by bundleRawAirfoils.test.ts into
 * public/datasets/uiuc-raw.json. Colors cycle through matplotlib's tab10.
 */
import { useEffect, useMemo, useState } from 'react'

interface RawRecord {
  file: string
  group?: string
  usable?: boolean
  points?: [number, number][]
  xmin?: number; xmax?: number; ymin?: number; ymax?: number
  error?: string
}

/** matplotlib tab10 cycle (the default plot colors). */
const PALETTE = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf']

/**
 * Excluded for visual uniformity: not single-airfoil shapes in the ordinary
 * sense. The 30p-30n-* are pieces of a multi-element high-lift assembly stored
 * at their installation angles (flap deflected, main with a TE cove for the
 * flap). The fx79w-* and ah93w480b are extreme flatback wind-turbine airfoils
 * (18–29 % TE thickness) that disproportionately catch the eye.
 */
const EXCLUDE = new Set([
  '30p-30n-flap.dat',
  '30p-30n-main.dat',
  'ah93w480b.dat',
  'fx79w660a.dat',
  'fx79w470a.dat',
])

interface Placement {
  rec: RawRecord
  /** Math-coordinates (y-up): center of the airfoil in viewbox units. */
  cx: number; cy: number
  /** Scale (airfoil chord in viewbox units). */
  scale: number
  /** Rotation angle (radians, math frame); airfoil chord points along this angle. */
  angle: number
  /** Ring index (1-based). */
  ring: number
}

function buildLayout(records: RawRecord[]) {
  const usable = records
    .filter(r => r.usable && r.points && r.xmin != null && r.xmax != null && r.points.length > 2 && !EXCLUDE.has(r.file))
    .sort((a, b) => a.file.localeCompare(b.file)) // stable: adjacent ring slots vary in shape

  const placements: Placement[] = []
  let idx = 0
  let r = 0 // cumulative radius Σ 0.8^k
  let i = 1
  while (idx < usable.length && i < 20) {
    const N = 4 * Math.pow(2, i)             // ring capacity: 8, 16, 32, …
    r += Math.pow(0.8, i)                    // accumulate radius
    const scale = Math.pow(0.75, i)
    const initialRot = Math.PI / 8 / i
    const step = 2 * Math.PI / N

    const count = Math.min(N, usable.length - idx)
    for (let j = 0; j < count; j++) {
      const angle = initialRot + j * step
      placements.push({
        rec: usable[idx++],
        cx: r * Math.cos(angle),
        cy: r * Math.sin(angle),
        scale,
        angle,
        ring: i,
      })
    }
    i++
  }
  return { placements, count: idx, rings: i - 1 }
}

/** Build an SVG path for one airfoil, rotated by `angle` around its center, in
 *  SVG coordinates (y-down). Math-y-up input is flipped at the end. */
function airfoilPath(P: Placement): string {
  const r = P.rec
  if (!r.points || r.xmin == null || r.xmax == null || r.ymin == null || r.ymax == null) return ''
  const chord = r.xmax - r.xmin
  if (!(chord > 0)) return ''
  const midX = (r.xmin + r.xmax) / 2
  const midY = (r.ymin + r.ymax) / 2
  const s = P.scale / chord
  const cosA = Math.cos(P.angle), sinA = Math.sin(P.angle)
  let d = ''
  for (let i = 0; i < r.points.length; i++) {
    const lx = (r.points[i][0] - midX) * s
    const ly = (r.points[i][1] - midY) * s
    // Rotate (lx, ly) by P.angle around airfoil center, then translate to (cx, cy) — all math frame.
    const mx = cosA * lx - sinA * ly + P.cx
    const my = sinA * lx + cosA * ly + P.cy
    // Flip y for SVG.
    d += (i === 0 ? 'M' : 'L') + mx.toFixed(4) + ' ' + (-my).toFixed(4) + ' '
  }
  return d + 'Z'
}

interface Props {
  /** Max-height CSS for the SVG. Default '82vh' (full-page reference slide). */
  maxHeight?: string
}

export default function DatasetGalaxy({ maxHeight = '82vh' }: Props = {}) {
  const [recs, setRecs] = useState<RawRecord[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/datasets/uiuc-raw.json')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
      .then(setRecs)
      .catch(e => setErr(e.message))
  }, [])

  const layout = useMemo(() => recs ? buildLayout(recs) : null, [recs])

  if (err) return (
    <div style={{ padding: '2em', color: '#888' }}>
      Dataset not yet available ({err}). Generate it via{' '}
      <code>npx vitest run …/bundleRawAirfoils.test.ts</code>.
    </div>
  )
  if (!layout) return <div style={{ padding: '2em', color: '#888' }}>Loading airfoils…</div>

  // ViewBox encompasses all placements (with margin for airfoil extent).
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const P of layout.placements) {
    const m = P.scale * 0.6 // half-chord plus a touch of vertical thickness
    if (P.cx - m < minX) minX = P.cx - m
    if (P.cx + m > maxX) maxX = P.cx + m
    if (-P.cy - m < minY) minY = -P.cy - m // -cy because of SVG y-flip
    if (-P.cy + m > maxY) maxY = -P.cy + m
  }
  // Square the viewbox.
  const w = maxX - minX, h = maxY - minY, sz = Math.max(w, h) * 1.02
  const cx0 = (minX + maxX) / 2, cy0 = (minY + maxY) / 2
  const vb = `${cx0 - sz / 2} ${cy0 - sz / 2} ${sz} ${sz}`

  return (
    <div style={{ width: '100%', textAlign: 'center' }}>
      <svg
        viewBox={vb}
        style={{ width: '100%', height: 'auto', maxHeight, background: '#ffffff' }}
      >
        {layout.placements.map((P, i) => {
          const d = airfoilPath(P)
          if (!d) return null
          const color = PALETTE[i % PALETTE.length]
          // Line width thins for outer rings (Eric's original: 0.8^i).
          const sw = Math.max(Math.pow(0.8, P.ring) * 1.4, 0.25)
          return <path key={i} d={d} stroke={color} strokeWidth={sw} fill="none" vectorEffect="non-scaling-stroke" />
        })}
      </svg>
    </div>
  )
}

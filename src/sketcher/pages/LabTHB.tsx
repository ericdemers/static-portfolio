// THB-splines learning workbench (1D). See the hierarchical selection, the
// truncation, and — the centerpiece — toggle truncation on/off and watch the
// partition-of-unity sum break and heal at the seam.
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { computeTHB, thbDomain, type THBData } from '../lab/thb/thb1d'

const COLORS = {
  kept: '#3b82f6', // coarse, outside the refined region
  straddling: '#f59e0b', // coarse, crosses the boundary (the ones truncation cuts)
  removed: '#9ca3af', // coarse, replaced by fine (shown faint)
  fine: '#10b981', // active fine functions
  sum: '#111827',
  sumDark: '#e5e7eb',
}

// SVG geometry
const W = 920
const H = 380
const PAD = { left: 44, right: 16, top: 16, bottom: 44 }
const PW = W - PAD.left - PAD.right
const PH = H - PAD.top - PAD.bottom

export default function LabTHB() {
  const [degree, setDegree] = useState(2)
  const [truncated, setTruncated] = useState(true)
  const [showSum, setShowSum] = useState(true)
  const [spotlight, setSpotlight] = useState<number | null>(null)
  // refinement region [a,b] in coarse cells (integers)
  const [region, setRegion] = useState<[number, number]>([3, 7])
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<0 | 1 | null>(null)

  const [tMin, tMax] = thbDomain(degree)

  // Keep the region inside the valid window when the degree changes.
  const a = Math.min(Math.max(region[0], tMin), tMax - 1)
  const b = Math.min(Math.max(region[1], a + 1), tMax)

  const data: THBData = useMemo(() => computeTHB(degree, a, b, 600), [degree, a, b])

  const yMax = useMemo(() => {
    const sums = showSum ? (truncated ? data.sumTHB : data.sumHB) : [1]
    return Math.max(1.12, Math.max(...sums) * 1.06)
  }, [data, showSum, truncated])

  const sx = (t: number) => PAD.left + ((t - tMin) / (tMax - tMin)) * PW
  const sy = (v: number) => PAD.top + PH - (v / yMax) * PH
  const path = (xs: number[], vs: number[]) =>
    xs.map((x, i) => `${i ? 'L' : 'M'} ${sx(x).toFixed(1)} ${sy(vs[i]).toFixed(1)}`).join(' ')

  // pointer→parameter, snapped to integer cells, for the region handles
  const eventT = (e: React.PointerEvent): number => {
    const svg = svgRef.current
    if (!svg) return tMin
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    const x = ctm ? pt.matrixTransform(ctm.inverse()).x : 0
    return Math.round(tMin + ((x - PAD.left) / PW) * (tMax - tMin))
  }
  const onHandleDown = (which: 0 | 1) => (e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragRef.current = which
  }
  const onMove = (e: React.PointerEvent) => {
    if (dragRef.current === null) return
    const t = Math.min(Math.max(eventT(e), tMin), tMax)
    setRegion((r) => {
      const next: [number, number] = [...r]
      next[dragRef.current as 0 | 1] = t
      return [Math.min(next[0], next[1]), Math.max(next[0], next[1])]
    })
  }
  const onUp = () => {
    dragRef.current = null
  }

  const spotlit = spotlight != null ? data.coarse.find((c) => c.index === spotlight) : undefined
  const dim = (on: boolean) => (spotlit ? (on ? 1 : 0.08) : 1)

  return (
    <div className="h-screen flex flex-col bg-steelblue-900 bg-gradient-to-br from-steelblue-900 to-steelblue-200">
      <header className="flex items-center gap-4 px-4 py-2 border-b border-gray-200 dark:border-gray-800">
        <Link to="/lab" className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400">Lab</Link>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">THB‑splines Workbench (1D)</h1>
        <span className="text-xs text-gray-500 italic">hierarchical B‑splines · truncation · partition of unity</span>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Controls */}
        <div className="w-72 shrink-0 overflow-auto border-r border-gray-200 dark:border-gray-800 p-4 flex flex-col gap-4 text-sm text-gray-700 dark:text-gray-300">
          <div>
            <div className="font-semibold mb-1">Degree (p)</div>
            <div className="flex gap-2">
              {[1, 2, 3].map((p) => (
                <button
                  key={p}
                  onClick={() => { setDegree(p); setSpotlight(null) }}
                  className={`px-3 py-1 rounded ${degree === p ? 'bg-blue-500 text-white' : 'border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">continuity C<sup>{degree - 1}</sup> everywhere, including across the seam</div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={truncated} onChange={(e) => setTruncated(e.target.checked)} />
            <span className="font-semibold">{truncated ? 'Truncated (THB)' : 'Hierarchical (HB)'}</span>
          </label>
          <div className="-mt-2 text-[11px] text-gray-400">
            the star of the show — flip it with “show sum” on and watch partition of unity break / heal
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={showSum} onChange={(e) => setShowSum(e.target.checked)} />
            <span>Show sum (partition of unity)</span>
          </label>

          <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
            <div className="font-semibold mb-1">Refinement region</div>
            <div className="font-mono text-xs">cells [{a}, {b}]</div>
            <div className="text-[11px] text-gray-400 mt-1">drag the orange handles on the axis. Coarse functions fully inside are <span className="text-gray-500">replaced</span>; ones crossing the edge are <span style={{ color: COLORS.straddling }}>truncated</span>.</div>
          </div>

          <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
            <div className="font-semibold mb-1">Truncation spotlight</div>
            {spotlit ? (
              <div className="text-[11px] text-gray-500">
                Showing coarse N⁰<sub>{spotlit.index}</sub> = Σ w<sub>k</sub> N¹. Dashed/grey children are <b>active</b> → dropped by truncation; solid ones survive.
                <button onClick={() => setSpotlight(null)} className="ml-1 text-blue-500">clear</button>
              </div>
            ) : (
              <div className="text-[11px] text-gray-400">click a coarse bump’s dot to see its two‑scale decomposition and what truncation drops.</div>
            )}
          </div>

          <div className="mt-auto pt-3 border-t border-gray-200 dark:border-gray-800 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
            <span style={{ color: COLORS.kept }}>■</span> coarse (kept) ·{' '}
            <span style={{ color: COLORS.straddling }}>■</span> coarse (truncated) ·{' '}
            <span style={{ color: COLORS.fine }}>■</span> fine (active) ·{' '}
            <span style={{ color: COLORS.removed }}>■</span> coarse (replaced)
          </div>
        </div>

        {/* Plot */}
        <div className="flex-1 min-w-0 p-3">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-full"
            onPointerMove={onMove}
            onPointerUp={onUp}
            onClick={() => setSpotlight(null)}
          >
            {/* refined region shading */}
            <rect x={sx(a)} y={PAD.top} width={sx(b) - sx(a)} height={PH} fill="#f59e0b" opacity={0.07} />

            {/* coarse cell gridlines + fine gridlines inside region */}
            {Array.from({ length: tMax - tMin + 1 }, (_, k) => tMin + k).map((t) => (
              <line key={`g${t}`} x1={sx(t)} y1={PAD.top} x2={sx(t)} y2={PAD.top + PH} stroke="#9ca3af" strokeWidth={0.4} opacity={0.4} />
            ))}
            {Array.from({ length: 2 * (b - a) + 1 }, (_, k) => a + k / 2).map((t) =>
              t % 1 !== 0 ? <line key={`h${t}`} x1={sx(t)} y1={PAD.top + PH - 8} x2={sx(t)} y2={PAD.top + PH} stroke={COLORS.fine} strokeWidth={0.5} opacity={0.5} /> : null,
            )}

            {/* y = 1 reference */}
            <line x1={PAD.left} y1={sy(1)} x2={W - PAD.right} y2={sy(1)} stroke="#9ca3af" strokeWidth={0.8} strokeDasharray="4 4" />
            <text x={PAD.left - 6} y={sy(1) + 3} textAnchor="end" fontSize={10} fill="#9ca3af">1</text>
            {/* x axis */}
            <line x1={PAD.left} y1={sy(0)} x2={W - PAD.right} y2={sy(0)} stroke="#6b7280" strokeWidth={0.8} />

            {/* spotlight: the selected coarse function's two-scale children */}
            {spotlit &&
              spotlit.children.map((ch) => {
                const f = data.fine.find((ff) => ff.index === ch.fineIndex)
                if (!f) return null
                // weighted child curve
                const wv = f.values.map((v) => v * ch.weight)
                return (
                  <path
                    key={`sp${ch.fineIndex}`}
                    d={path(data.xs, wv)}
                    fill="none"
                    stroke={ch.active ? COLORS.straddling : COLORS.fine}
                    strokeWidth={1.4}
                    strokeDasharray={ch.active ? '4 3' : undefined}
                    opacity={0.9}
                  />
                )
              })}

            {/* coarse functions (kept + straddling; removed shown faint) */}
            {data.coarse.map((c) => {
              if (c.status === 'removed') {
                return (
                  <path key={`c${c.index}`} d={path(data.xs, c.full)} fill="none" stroke={COLORS.removed} strokeWidth={1} strokeDasharray="2 3" opacity={dim(false) * 0.6} />
                )
              }
              const vs = truncated ? c.trunc : c.full
              const color = c.status === 'straddling' ? COLORS.straddling : COLORS.kept
              const peakX = (c.support[0] + c.support[1]) / 2
              const peakI = data.xs.reduce((best, x, i) => (Math.abs(x - peakX) < Math.abs(data.xs[best] - peakX) ? i : best), 0)
              return (
                <g key={`c${c.index}`} opacity={dim(spotlit ? c.index === spotlit.index : true)}>
                  <path d={path(data.xs, vs)} fill="none" stroke={color} strokeWidth={2} />
                  <circle
                    cx={sx(peakX)}
                    cy={sy(vs[peakI])}
                    r={4}
                    fill={color}
                    className="cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setSpotlight(c.index === spotlight ? null : c.index) }}
                  />
                </g>
              )
            })}

            {/* active fine functions */}
            {data.fine.map((f) =>
              f.active ? (
                <path key={`f${f.index}`} d={path(data.xs, f.values)} fill="none" stroke={COLORS.fine} strokeWidth={1.4} opacity={dim(false)} />
              ) : null,
            )}

            {/* partition-of-unity sum */}
            {showSum && (
              <path
                d={path(data.xs, truncated ? data.sumTHB : data.sumHB)}
                fill="none"
                stroke={truncated ? '#a855f7' : '#ef4444'}
                strokeWidth={2.6}
                opacity={0.95}
              />
            )}

            {/* region handles */}
            {([a, b] as const).map((t, i) => (
              <g key={`hdl${i}`} className="cursor-ew-resize" onPointerDown={onHandleDown(i as 0 | 1)}>
                <line x1={sx(t)} y1={PAD.top} x2={sx(t)} y2={PAD.top + PH + 6} stroke={COLORS.straddling} strokeWidth={1.5} />
                <circle cx={sx(t)} cy={PAD.top + PH + 6} r={6} fill={COLORS.straddling} />
              </g>
            ))}

            {/* x ticks */}
            {Array.from({ length: tMax - tMin + 1 }, (_, k) => tMin + k).map((t) => (
              <text key={`t${t}`} x={sx(t)} y={H - 8} textAnchor="middle" fontSize={10} fill="#9ca3af">{t}</text>
            ))}
          </svg>

          {showSum && (
            <div className={`text-xs text-center -mt-1 font-mono ${truncated ? 'text-emerald-600' : 'text-red-500'}`}>
              {truncated
                ? 'THB: the truncated basis sums to exactly 1 — partition of unity holds.'
                : 'HB (no truncation): the sum bulges above 1 at the seam — the coarse functions double‑count the fine ones.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

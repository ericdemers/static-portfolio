/**
 * WalkDiagram — visual proof of the combinatorial lemma.
 *
 * Shows a concrete flip pattern χ = (1, 1, 1, 0, 1, 1, 1) over σ (7
 * positions, anchor in the middle). Each cell displays its χ value.
 * Amber vertical bars between cells with differing values mark the
 * **transitions** of χ — the audience can count them directly.
 *
 * Below the row, two arrows span the two "walks":
 *   - From χ(0) to the anchor — at least χ(0) transitions.
 *   - From the anchor to χ(k-1) — at least χ(k-1) transitions.
 *
 * The lemma T(χ) ≥ χ(0) + χ(k-1) is stated at the bottom. For this
 * example: T(χ) = 2 and χ(0) + χ(k-1) = 1 + 1 = 2 (equality, the
 * tightest case).
 *
 * Used by slide 11 (Proof).
 */

interface Props {
  width?: number
  height?: number
}

const COLORS = {
  cellOne: 'white',
  cellOneBorder: '#3b82f6',
  cellOneText: '#3b82f6',
  cellZero: '#f59e0b',
  cellZeroText: 'white',
  transition: '#f59e0b',
  label: '#475569',
  endpointLabel: '#3b82f6',
  anchorLabel: '#f59e0b',
  arc: '#475569',
  bottomNote: '#1f2937',
}

const PATTERN = [1, 1, 1, 0, 1, 1, 1]
const ANCHOR_IDX = 3

export default function WalkDiagram({ width = 380, height = 280 }: Props) {
  const n = PATTERN.length
  const cellW = 34
  const cellH = 34
  const gap = 8
  const rowWidth = n * cellW + (n - 1) * gap
  const startX = (width - rowWidth) / 2
  const rowY = 62

  const cellX = (i: number) => startX + i * (cellW + gap)
  const cellCenterX = (i: number) => cellX(i) + cellW / 2

  // Transition positions: gaps between cells where values differ.
  const transitionGaps: number[] = []
  for (let i = 0; i < n - 1; i++) {
    if (PATTERN[i] !== PATTERN[i + 1]) transitionGaps.push(i)
  }
  const transitionX = (i: number) => cellX(i) + cellW + gap / 2

  const labelY = rowY + cellH + 22

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: 'auto' }}
    >
      {/* Cells with χ values */}
      {PATTERN.map((v, i) => {
        const isAnchor = i === ANCHOR_IDX
        return (
          <g key={i}>
            <rect
              x={cellX(i)}
              y={rowY}
              width={cellW}
              height={cellH}
              fill={isAnchor ? COLORS.cellZero : COLORS.cellOne}
              stroke={isAnchor ? COLORS.cellZero : COLORS.cellOneBorder}
              strokeWidth={1.5}
              rx={4}
            />
            <text
              x={cellCenterX(i)}
              y={rowY + cellH / 2 + 5}
              textAnchor="middle"
              fontSize={15}
              fontWeight={700}
              fill={isAnchor ? COLORS.cellZeroText : COLORS.cellOneText}
            >
              {v}
            </text>
          </g>
        )
      })}

      {/* Transition markers — amber vertical bars in the gaps where χ changes */}
      {transitionGaps.map((i) => (
        <line
          key={`t-${i}`}
          x1={transitionX(i)}
          y1={rowY - 8}
          x2={transitionX(i)}
          y2={rowY + cellH + 8}
          stroke={COLORS.transition}
          strokeWidth={2.5}
        />
      ))}

      {/* Labels below the row */}
      <text
        x={cellCenterX(0)}
        y={labelY}
        textAnchor="middle"
        fontSize={13}
        fontStyle="italic"
        fill={COLORS.endpointLabel}
      >
        χ(0)
      </text>
      <text
        x={cellCenterX(ANCHOR_IDX)}
        y={labelY}
        textAnchor="middle"
        fontSize={13}
        fontStyle="italic"
        fontWeight={600}
        fill={COLORS.anchorLabel}
      >
        anchor
      </text>
      <text
        x={cellCenterX(n - 1)}
        y={labelY}
        textAnchor="middle"
        fontSize={13}
        fontStyle="italic"
        fill={COLORS.endpointLabel}
      >
        χ(k−1)
      </text>

    </svg>
  )
}

/**
 * AllFlipDiagram — visualizes one all-flip case (interior or boundary).
 *
 * Renders two rows of colored circles (green + / red −): the polygon
 * before any flip, and the polygon after the all-flip on σ. The σ range
 * is bracketed; the junction pairs that *become* new sign changes are
 * indicated by amber arrows above the after-row. Sign-change counts S
 * are shown on the right of each row, with the gain annotated on the
 * after-row.
 *
 * Used by the slide that visualizes the all-flip failure mode (between
 * slides 9 Intuition and 11 Proof).
 */

interface Props {
  /** Polygon, as a sequence of +1 / −1. */
  pattern: number[]
  /** Indices of σ within `pattern` (inclusive on both ends). */
  sigma: { start: number; end: number }
  /** Section title shown above the diagram (e.g. "Interior σ"). */
  title?: string
  /** SVG width / height (used by the viewBox). */
  width?: number
  height?: number
}

const COLORS = {
  positive: '#16a34a',
  negative: '#dc2626',
  sigmaBracket: '#475569',
  newSignChange: '#f59e0b',
  label: '#475569',
  labelMuted: '#94a3b8',
}

function countSignChanges(p: number[]): number {
  let count = 0
  for (let i = 0; i < p.length - 1; i++) {
    if (p[i] * p[i + 1] < 0) count++
  }
  return count
}

export default function AllFlipDiagram({
  pattern,
  sigma,
  title,
  width = 420,
  height = 300,
}: Props) {
  const afterPattern = pattern.map((v, i) =>
    i >= sigma.start && i <= sigma.end ? -v : v,
  )

  const sBefore = countSignChanges(pattern)
  const sAfter = countSignChanges(afterPattern)
  const gain = sAfter - sBefore

  // Indices i such that pair (i, i+1) was *not* a sign change before but *is* after.
  const newSignChangePairs: number[] = []
  for (let i = 0; i < pattern.length - 1; i++) {
    const wasIt = pattern[i] * pattern[i + 1] < 0
    const isIt = afterPattern[i] * afterPattern[i + 1] < 0
    if (!wasIt && isIt) newSignChangePairs.push(i)
  }

  // Layout
  const n = pattern.length
  const r = 14
  const dx = 36
  const leftLabelWidth = 56
  const rightLabelWidth = 90
  const innerW = (n - 1) * dx + 2 * r
  const startX = leftLabelWidth + (width - leftLabelWidth - rightLabelWidth - innerW) / 2 + r
  const cx = (i: number) => startX + i * dx

  const titleY = 28
  const beforeY = 110
  const sigmaBracketY = 145
  const afterY = 215

  const sigmaLeftX = cx(sigma.start) - r - 4
  const sigmaRightX = cx(sigma.end) + r + 4

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: 'auto' }}
    >
      <defs>
        <marker
          id={`allflip-arrow-${title?.replace(/\s+/g, '-') ?? 'gen'}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS.newSignChange} />
        </marker>
      </defs>

      {/* Title */}
      {title && (
        <text
          x={width / 2}
          y={titleY}
          textAnchor="middle"
          fontSize={18}
          fontWeight={600}
          fill={COLORS.label}
        >
          {title}
        </text>
      )}

      {/* Arrows over the BEFORE row's about-to-be-new sign changes — but
          place them above the AFTER row, since that's where they become
          sign changes. We draw them now (before the circles) so circles
          render on top of arrow tails. */}

      {/* Before row label */}
      <text
        x={leftLabelWidth - 8}
        y={beforeY + 5}
        textAnchor="end"
        fontSize={14}
        fill={COLORS.label}
      >
        Before:
      </text>
      {pattern.map((v, i) => {
        const color = v > 0 ? COLORS.positive : COLORS.negative
        return (
          <g key={`b-${i}`}>
            <circle
              cx={cx(i)}
              cy={beforeY}
              r={r}
              fill={color}
              stroke="white"
              strokeWidth={1.5}
            />
            <text
              x={cx(i)}
              y={beforeY + 5}
              textAnchor="middle"
              fontSize={14}
              fontWeight={700}
              fill="white"
            >
              {v > 0 ? '+' : '−'}
            </text>
          </g>
        )
      })}
      <text
        x={cx(n - 1) + r + 12}
        y={beforeY + 5}
        fontSize={14}
        fill={COLORS.label}
      >
        S = {sBefore}
      </text>

      {/* σ bracket below the before row */}
      <line
        x1={sigmaLeftX}
        y1={sigmaBracketY - 6}
        x2={sigmaLeftX}
        y2={sigmaBracketY}
        stroke={COLORS.sigmaBracket}
        strokeWidth={1.6}
      />
      <line
        x1={sigmaLeftX}
        y1={sigmaBracketY}
        x2={sigmaRightX}
        y2={sigmaBracketY}
        stroke={COLORS.sigmaBracket}
        strokeWidth={1.6}
      />
      <line
        x1={sigmaRightX}
        y1={sigmaBracketY}
        x2={sigmaRightX}
        y2={sigmaBracketY - 6}
        stroke={COLORS.sigmaBracket}
        strokeWidth={1.6}
      />
      <text
        x={(sigmaLeftX + sigmaRightX) / 2}
        y={sigmaBracketY + 18}
        textAnchor="middle"
        fontSize={15}
        fontStyle="italic"
        fill={COLORS.sigmaBracket}
      >
        σ
      </text>

      {/* Arrows over the AFTER row, pointing to new sign changes */}
      {newSignChangePairs.map((i) => {
        const midX = (cx(i) + cx(i + 1)) / 2
        const tipY = afterY - r - 4
        const tailY = afterY - r - 22
        const arrowId = `allflip-arrow-${title?.replace(/\s+/g, '-') ?? 'gen'}`
        return (
          <line
            key={`new-${i}`}
            x1={midX}
            y1={tailY}
            x2={midX}
            y2={tipY}
            stroke={COLORS.newSignChange}
            strokeWidth={2}
            markerEnd={`url(#${arrowId})`}
          />
        )
      })}

      {/* After row */}
      <text
        x={leftLabelWidth - 8}
        y={afterY + 5}
        textAnchor="end"
        fontSize={14}
        fill={COLORS.label}
      >
        After:
      </text>
      {afterPattern.map((v, i) => {
        const color = v > 0 ? COLORS.positive : COLORS.negative
        return (
          <g key={`a-${i}`}>
            <circle
              cx={cx(i)}
              cy={afterY}
              r={r}
              fill={color}
              stroke="white"
              strokeWidth={1.5}
            />
            <text
              x={cx(i)}
              y={afterY + 5}
              textAnchor="middle"
              fontSize={14}
              fontWeight={700}
              fill="white"
            >
              {v > 0 ? '+' : '−'}
            </text>
          </g>
        )
      })}
      <text
        x={cx(n - 1) + r + 12}
        y={afterY + 5}
        fontSize={14}
        fill={COLORS.label}
      >
        S = {sAfter}{' '}
        {gain > 0 && (
          <tspan fill={COLORS.newSignChange} fontWeight={600}>
            (+{gain})
          </tspan>
        )}
      </text>

      {/* Footer note: how many junctions became new sign changes */}
      <text
        x={width / 2}
        y={height - 14}
        textAnchor="middle"
        fontSize={13}
        fontStyle="italic"
        fill={COLORS.labelMuted}
      >
        {newSignChangePairs.length === 2
          ? 'Both junctions become new sign changes.'
          : newSignChangePairs.length === 1
            ? 'Only one junction; the other end is the polygon boundary.'
            : ''}
      </text>
    </svg>
  )
}

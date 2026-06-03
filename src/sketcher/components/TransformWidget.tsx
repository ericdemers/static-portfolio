// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
import { useMemo } from 'react'
import type { Point2D } from '../types/curve'
import { computeEdgeMidpoints, circleThrough3Points } from '../utils/transforms'
import { handlePointsToLines, solveIncircle } from '../utils/laguerreWidget'

interface TransformWidgetProps {
  widgetType: 'parallelogram' | 'quadrilateral' | 'mobius' | 'laguerre'
  currentWidget: Point2D[]
  zoom: number
  onHandlePointerDown: (e: React.PointerEvent, handleIndex: number, handleType: 'corner' | 'midpoint') => void
}

const WIDGET_COLOR = '#8b5cf6'
const CORNER_RADIUS = 7
const MIDPOINT_RADIUS = 5

export default function TransformWidget({
  widgetType,
  currentWidget,
  zoom,
  onHandlePointerDown,
}: TransformWidgetProps) {
  const midpoints = useMemo(() => {
    if (widgetType === 'mobius' || widgetType === 'laguerre') return []
    return computeEdgeMidpoints(currentWidget)
  }, [widgetType, currentWidget])

  if (widgetType === 'mobius') {
    return <MobiusWidget points={currentWidget} zoom={zoom} onHandlePointerDown={onHandlePointerDown} />
  }

  if (widgetType === 'laguerre') {
    return <LaguerreWidget points={currentWidget} zoom={zoom} onHandlePointerDown={onHandlePointerDown} />
  }

  // Parallelogram or Quadrilateral: 4 dashed edges + corner/midpoint handles
  const corners = currentWidget
  const edgePath = `M ${corners[0].x} ${corners[0].y} L ${corners[1].x} ${corners[1].y} L ${corners[2].x} ${corners[2].y} L ${corners[3].x} ${corners[3].y} Z`

  return (
    <g>
      {/* Dashed edges */}
      <path
        d={edgePath}
        fill="none"
        stroke={WIDGET_COLOR}
        strokeWidth={1.5 / zoom}
        strokeDasharray={`${6 / zoom} ${4 / zoom}`}
        opacity={0.7}
        style={{ pointerEvents: 'none' }}
      />

      {/* Midpoint handles (squares) */}
      {midpoints.map((mp, i) => {
        const size = MIDPOINT_RADIUS / zoom
        return (
          <rect
            key={`mid-${i}`}
            x={mp.x - size}
            y={mp.y - size}
            width={size * 2}
            height={size * 2}
            fill="white"
            stroke={WIDGET_COLOR}
            strokeWidth={1.5 / zoom}
            style={{ cursor: 'move' }}
            onPointerDown={(e) => onHandlePointerDown(e, i, 'midpoint')}
          />
        )
      })}

      {/* Corner handles (circles) */}
      {corners.map((corner, i) => (
        <circle
          key={`corner-${i}`}
          cx={corner.x}
          cy={corner.y}
          r={CORNER_RADIUS / zoom}
          fill="white"
          stroke={WIDGET_COLOR}
          strokeWidth={2 / zoom}
          style={{ cursor: 'move' }}
          onPointerDown={(e) => onHandlePointerDown(e, i, 'corner')}
        />
      ))}
    </g>
  )
}

function MobiusWidget({
  points,
  zoom,
  onHandlePointerDown,
}: {
  points: Point2D[]
  zoom: number
  onHandlePointerDown: (e: React.PointerEvent, handleIndex: number, handleType: 'corner' | 'midpoint') => void
}) {
  const circleInfo = useMemo(() => {
    if (points.length < 3) return null
    return circleThrough3Points(points[0], points[1], points[2])
  }, [points])

  return (
    <g>
      {/* Dashed circle through 3 points */}
      {circleInfo && (
        <circle
          cx={circleInfo.center.x}
          cy={circleInfo.center.y}
          r={circleInfo.radius}
          fill="none"
          stroke={WIDGET_COLOR}
          strokeWidth={1.5 / zoom}
          strokeDasharray={`${6 / zoom} ${4 / zoom}`}
          opacity={0.7}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Handle points */}
      {points.map((point, i) => (
        <circle
          key={`mobius-${i}`}
          cx={point.x}
          cy={point.y}
          r={CORNER_RADIUS / zoom}
          fill="white"
          stroke={WIDGET_COLOR}
          strokeWidth={2 / zoom}
          style={{ cursor: 'move' }}
          onPointerDown={(e) => onHandlePointerDown(e, i, 'corner')}
        />
      ))}
    </g>
  )
}

const LINE_COLORS = ['#4ecdc4', '#ff6b6b', '#fbbf24']
const ROTATION_HANDLE_DISTANCE = 70

function LaguerreWidget({
  points,
  zoom,
  onHandlePointerDown,
}: {
  points: Point2D[]
  zoom: number
  onHandlePointerDown: (e: React.PointerEvent, handleIndex: number, handleType: 'corner' | 'midpoint') => void
}) {
  // points layout: [pos0, pos1, pos2, rot0, rot1, rot2]
  const lines = useMemo(() => {
    if (points.length < 6) return []
    return handlePointsToLines(points)
  }, [points])

  const incircle = useMemo(() => {
    if (lines.length < 3) return null
    return solveIncircle(lines)
  }, [lines])

  if (points.length < 6) return null

  // Compute line directions and extents for rendering
  const lineData = lines.map((line) => {
    const nx = Math.cos(line.angle)
    const ny = Math.sin(line.angle)
    const dirX = -ny
    const dirY = nx
    return { nx, ny, dirX, dirY, px: line.px, py: line.py }
  })

  const lineExtent = 2000 / zoom

  return (
    <g>
      {/* Dashed incircle */}
      {incircle && Math.abs(incircle.r) > 0.5 && Math.abs(incircle.r) < 5000 && (
        <circle
          cx={incircle.cx}
          cy={incircle.cy}
          r={Math.abs(incircle.r)}
          fill="none"
          stroke={WIDGET_COLOR}
          strokeWidth={1.5 / zoom}
          strokeDasharray={`${6 / zoom} ${4 / zoom}`}
          opacity={0.6}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Lines, normals, and handles */}
      {lineData.map((ld, i) => {
        const color = LINE_COLORS[i]
        const rotPt = points[3 + i]
        // Normal arrow endpoint
        const normalLen = 30 / zoom
        const nEndX = ld.px + ld.nx * normalLen
        const nEndY = ld.py + ld.ny * normalLen

        return (
          <g key={`laguerre-line-${i}`}>
            {/* Oriented line (infinite extent) */}
            <line
              x1={ld.px - ld.dirX * lineExtent}
              y1={ld.py - ld.dirY * lineExtent}
              x2={ld.px + ld.dirX * lineExtent}
              y2={ld.py + ld.dirY * lineExtent}
              stroke={color}
              strokeWidth={1.5 / zoom}
              opacity={0.4}
              style={{ pointerEvents: 'none' }}
            />

            {/* Normal arrow */}
            <line
              x1={ld.px}
              y1={ld.py}
              x2={nEndX}
              y2={nEndY}
              stroke={color}
              strokeWidth={2 / zoom}
              opacity={0.7}
              style={{ pointerEvents: 'none' }}
            />
            {/* Arrowhead */}
            <polygon
              points={arrowheadPoints(nEndX, nEndY, ld.nx, ld.ny, 6 / zoom)}
              fill={color}
              opacity={0.8}
              style={{ pointerEvents: 'none' }}
            />

            {/* Position handle (larger circle) */}
            <circle
              cx={ld.px}
              cy={ld.py}
              r={CORNER_RADIUS / zoom}
              fill="white"
              stroke={color}
              strokeWidth={2 / zoom}
              style={{ cursor: 'move' }}
              onPointerDown={(e) => onHandlePointerDown(e, i, 'corner')}
            />

            {/* Rotation handle (smaller circle) */}
            <circle
              cx={rotPt.x}
              cy={rotPt.y}
              r={MIDPOINT_RADIUS / zoom}
              fill="white"
              stroke={color}
              strokeWidth={1.5 / zoom}
              style={{ cursor: 'crosshair' }}
              onPointerDown={(e) => onHandlePointerDown(e, i + 3, 'corner')}
            />
          </g>
        )
      })}
    </g>
  )
}

function arrowheadPoints(
  tipX: number, tipY: number,
  dirX: number, dirY: number,
  size: number,
): string {
  const bx = tipX - dirX * size
  const by = tipY - dirY * size
  const perpX = -dirY * size * 0.5
  const perpY = dirX * size * 0.5
  return `${tipX},${tipY} ${bx + perpX},${by + perpY} ${bx - perpX},${by - perpY}`
}

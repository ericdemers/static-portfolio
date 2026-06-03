// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
import { useRef, useEffect, useState } from 'react'
import { useSceneStore } from '../store/sceneStore'
import type { DrawingTool } from '../types/curve'

const pointerIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"
    />
  </svg>
)

const pencilIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
    />
  </svg>
)

const pinIcon = (filled: boolean) => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16 3l-4 4-4-1-4 4 6 6-4 4h2l3-3 3 3v2l4-4-6-6 4-4 1 4 4-4-2-2z"
    />
  </svg>
)

const chevronIcon = (expanded: boolean) => (
  <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
)

const offsetIcon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path
      d="M4 16 Q12 4 20 16"
      strokeWidth={2}
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M6 18 Q12 8 18 18"
      strokeWidth={2}
      strokeLinecap="round"
      fill="none"
      strokeDasharray="3 2"
    />
  </svg>
)

const tools: { tool: DrawingTool; label: string; icon: React.ReactNode }[] = [
  {
    tool: 'draw',
    label: 'Freehand',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          d="M 2 18 C 6 6.25, 8.5 9.25, 11.5 12 S 17 12, 22 5"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    tool: 'line',
    label: 'Line',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <line x1="5" y1="19" x2="19" y2="5" strokeWidth={2} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    tool: 'circle',
    label: 'Circle',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          d="M5 19 Q12 5 19 19"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    ),
  },
]

export default function PencilTool({ className }: { className?: string }) {
  const { pencilExpanded, setPencilExpanded, activeTool, setActiveTool, toolLocked, setToolLocked, curves, phMetadata, selectedCurveId, setOffsetSourceCurveId } = useSceneStore()
  const menuRef = useRef<HTMLDivElement>(null)
  const [phExpanded, setPhExpanded] = useState(false)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setPencilExpanded(false)
      }
    }

    if (pencilExpanded) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [pencilExpanded, setPencilExpanded])

  // Auto-expand PH submenu when a PH tool is active
  useEffect(() => {
    if (pencilExpanded && (activeTool === 'spiral' || activeTool === 'rational-spiral' || activeTool === 'offset')) {
      setPhExpanded(true)
    }
  }, [pencilExpanded, activeTool])

  // Show pencil icon when no tool is active, otherwise show the active tool's icon
  const getCurrentIcon = () => {
    if (activeTool === 'none') {
      return pencilIcon
    }
    if (activeTool === 'offset') {
      return offsetIcon
    }
    const currentTool = tools.find((t) => t.tool === activeTool)
    return currentTool?.icon || pencilIcon
  }

  const hasCurves = curves.length > 0
  const isSelectionMode = activeTool === 'none'
  const isPHToolActive = activeTool === 'spiral' || activeTool === 'rational-spiral' || activeTool === 'complex-spiral' || activeTool === 'offset'

  return (
    <div className={className ?? "absolute top-3 right-3 z-50 flex gap-2"} ref={menuRef}>
      {/* Pointer/Selection button - only visible when there are curves */}
      {hasCurves && (
        <button
          onClick={() => setActiveTool('none')}
          className={`w-10 h-10 flex items-center justify-center rounded-lg border shadow-sm transition-colors ${
            isSelectionMode
              ? 'bg-blue-500 border-blue-600 text-white'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
          aria-label="Selection mode"
        >
          {pointerIcon}
        </button>
      )}

      {/* Pencil/Drawing tools button */}
      <button
        onClick={() => setPencilExpanded(!pencilExpanded)}
        className={`w-10 h-10 flex items-center justify-center rounded-lg border shadow-sm transition-colors ${
          activeTool !== 'none' && toolLocked
            ? 'bg-blue-500 border-blue-600 text-white'
            : pencilExpanded
              ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
        }`}
        aria-label="Drawing tools"
      >
        {getCurrentIcon()}
      </button>

      {pencilExpanded && (
        <div className="absolute top-12 right-0 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 overflow-hidden">
          {/* Standard drawing tools */}
          {tools.map(({ tool, label, icon }) => {
            const isActive = activeTool === tool
            const isPinned = isActive && toolLocked

            return (
              <div
                key={tool}
                className={`flex items-center transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <button
                  className={`flex-1 flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-200'
                  }`}
                  onClick={() => {
                    if (isActive) {
                      setActiveTool('none')
                    } else {
                      setActiveTool(tool)
                    }
                    setPencilExpanded(false)
                  }}
                >
                  {icon}
                  {label}
                </button>

                <button
                  className={`px-3 py-2.5 transition-colors ${
                    isPinned
                      ? 'text-blue-500 dark:text-blue-400'
                      : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
                  onClick={() => {
                    if (isPinned) {
                      setToolLocked(false)
                    } else {
                      if (!isActive) {
                        setActiveTool(tool)
                      }
                      setToolLocked(true)
                    }
                    setPencilExpanded(false)
                  }}
                  aria-label={isPinned ? `Unpin ${label}` : `Pin ${label}`}
                >
                  {pinIcon(isPinned)}
                </button>
              </div>
            )
          })}

          {/* PH Curve submenu */}
          <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1">
            {/* PH Curve header row — click to expand/collapse */}
            <button
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isPHToolActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              onClick={() => setPhExpanded(!phExpanded)}
            >
              <span className="flex-1 text-left">PH Curve</span>
              {chevronIcon(phExpanded)}
            </button>

            {/* PH sub-items (indented) */}
            {phExpanded && (
              <div>
                {/* Polynomial PH — wired to 'spiral' tool */}
                {(() => {
                  const isActive = activeTool === 'spiral'
                  const isPinned = isActive && toolLocked
                  return (
                    <div
                      className={`flex items-center transition-colors ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-900/30'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <button
                        className={`flex-1 pl-8 pr-4 py-2 text-sm text-left transition-colors ${
                          isActive
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-gray-700 dark:text-gray-200'
                        }`}
                        onClick={() => {
                          if (isActive) {
                            setActiveTool('none')
                          } else {
                            setActiveTool('spiral')
                          }
                          setPencilExpanded(false)
                        }}
                      >
                        Polynomial
                      </button>

                      <button
                        className={`px-3 py-2 transition-colors ${
                          isPinned
                            ? 'text-blue-500 dark:text-blue-400'
                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                        }`}
                        onClick={() => {
                          if (isPinned) {
                            setToolLocked(false)
                          } else {
                            if (!isActive) {
                              setActiveTool('spiral')
                            }
                            setToolLocked(true)
                          }
                          setPencilExpanded(false)
                        }}
                        aria-label={isPinned ? 'Unpin Polynomial PH' : 'Pin Polynomial PH'}
                      >
                        {pinIcon(isPinned)}
                      </button>
                    </div>
                  )
                })()}

                {/* Rational PH — wired to 'rational-spiral' tool */}
                {(() => {
                  const isActive = activeTool === 'rational-spiral'
                  const isPinned = isActive && toolLocked
                  return (
                    <div
                      className={`flex items-center transition-colors ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-900/30'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <button
                        className={`flex-1 pl-8 pr-4 py-2 text-sm text-left transition-colors ${
                          isActive
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-gray-700 dark:text-gray-200'
                        }`}
                        onClick={() => {
                          if (isActive) {
                            setActiveTool('none')
                          } else {
                            setActiveTool('rational-spiral')
                          }
                          setPencilExpanded(false)
                        }}
                      >
                        Rational
                      </button>

                      <button
                        className={`px-3 py-2 transition-colors ${
                          isPinned
                            ? 'text-blue-500 dark:text-blue-400'
                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                        }`}
                        onClick={() => {
                          if (isPinned) {
                            setToolLocked(false)
                          } else {
                            if (!isActive) {
                              setActiveTool('rational-spiral')
                            }
                            setToolLocked(true)
                          }
                          setPencilExpanded(false)
                        }}
                        aria-label={isPinned ? 'Unpin Rational PH' : 'Pin Rational PH'}
                      >
                        {pinIcon(isPinned)}
                      </button>
                    </div>
                  )
                })()}

                {/* Complex Rational PH — wired to 'complex-spiral' tool */}
                {(() => {
                  const isActive = activeTool === 'complex-spiral'
                  const isPinned = isActive && toolLocked
                  return (
                    <div
                      className={`flex items-center transition-colors ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-900/30'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <button
                        className={`flex-1 pl-8 pr-4 py-2 text-sm text-left transition-colors ${
                          isActive
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-gray-700 dark:text-gray-200'
                        }`}
                        onClick={() => {
                          if (isActive) {
                            setActiveTool('none')
                          } else {
                            setActiveTool('complex-spiral')
                          }
                          setPencilExpanded(false)
                        }}
                      >
                        Complex
                      </button>

                      <button
                        className={`px-3 py-2 transition-colors ${
                          isPinned
                            ? 'text-blue-500 dark:text-blue-400'
                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                        }`}
                        onClick={() => {
                          if (isPinned) {
                            setToolLocked(false)
                          } else {
                            if (!isActive) {
                              setActiveTool('complex-spiral')
                            }
                            setToolLocked(true)
                          }
                          setPencilExpanded(false)
                        }}
                        aria-label={isPinned ? 'Unpin Complex PH' : 'Pin Complex PH'}
                      >
                        {pinIcon(isPinned)}
                      </button>
                    </div>
                  )
                })()}

                {/* Offset — conditional, only when a PH curve is selected */}
                {selectedCurveId && phMetadata.has(selectedCurveId) && (() => {
                  const isActive = activeTool === 'offset'
                  const isPinned = isActive && toolLocked

                  return (
                    <div
                      className={`flex items-center transition-colors ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-900/30'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <button
                        className={`flex-1 pl-8 pr-4 py-2 text-sm text-left transition-colors ${
                          isActive
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-gray-700 dark:text-gray-200'
                        }`}
                        onClick={() => {
                          if (isActive) {
                            setActiveTool('none')
                            setOffsetSourceCurveId(null)
                          } else {
                            setActiveTool('offset')
                            setOffsetSourceCurveId(selectedCurveId)
                          }
                          setPencilExpanded(false)
                        }}
                      >
                        Offset
                      </button>

                      <button
                        className={`px-3 py-2 transition-colors ${
                          isPinned
                            ? 'text-blue-500 dark:text-blue-400'
                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                        }`}
                        onClick={() => {
                          if (isPinned) {
                            setToolLocked(false)
                          } else {
                            if (!isActive) {
                              setActiveTool('offset')
                              setOffsetSourceCurveId(selectedCurveId)
                            }
                            setToolLocked(true)
                          }
                          setPencilExpanded(false)
                        }}
                        aria-label={isPinned ? 'Unpin Offset' : 'Pin Offset'}
                      >
                        {pinIcon(isPinned)}
                      </button>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

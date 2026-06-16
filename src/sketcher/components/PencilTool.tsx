// Being migrated to core/ incrementally; remove this once a file is on core.
import { useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

// Offset: two parallel lines — a curve and its offset copy run parallel.
const offsetIcon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <line x1="4" y1="9" x2="20" y2="9" strokeWidth={2} strokeLinecap="round" />
    <line x1="4" y1="15" x2="20" y2="15" strokeWidth={2} strokeLinecap="round" />
  </svg>
)

// PH Curve: a smooth curve.
const phCurveIcon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path d="M3 18 C 7 18, 9 6, 13 6 S 20 11, 21 11" strokeWidth={2} strokeLinecap="round" />
  </svg>
)

const tools: { tool: DrawingTool; labelKey: string; icon: React.ReactNode }[] = [
  {
    tool: 'draw',
    labelKey: 'tools.freehand',
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
    labelKey: 'tools.line',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <line x1="5" y1="19" x2="19" y2="5" strokeWidth={2} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    tool: 'circle',
    labelKey: 'tools.circle',
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
  const { t } = useTranslation()
  const { pencilExpanded, setPencilExpanded, activeTool, setActiveTool, toolLocked, setToolLocked, curves } = useSceneStore()
  const menuRef = useRef<HTMLDivElement>(null)
  const [, setPhExpanded] = useState(false)

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
          {tools.map(({ tool, labelKey, icon }) => {
            const isActive = activeTool === tool
            const isPinned = isActive && toolLocked
            const label = t(labelKey)

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

          {/* PH Curve — one tool (AB-PH: enforces the curvature-extrema bound,
              supports offset + Möbius/Laguerre transforms). Drawn from two
              points like a line. Offset appears below when a PH curve is
              selected. */}
          <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1">
            {(() => {
              const isActive = activeTool === 'complex-spiral'
              const isPinned = isActive && toolLocked
              return (
                <div
                  className={`flex items-center transition-colors ${
                    isActive ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <button
                    className={`flex-1 flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'
                    }`}
                    onClick={() => {
                      setActiveTool(isActive ? 'none' : 'complex-spiral')
                      setPencilExpanded(false)
                    }}
                  >
                    {phCurveIcon}
                    {t('tools.ph')}
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
                        if (!isActive) setActiveTool('complex-spiral')
                        setToolLocked(true)
                      }
                      setPencilExpanded(false)
                    }}
                    aria-label={isPinned ? 'Unpin PH Curve' : 'Pin PH Curve'}
                  >
                    {pinIcon(isPinned)}
                  </button>
                </div>
              )
            })()}

            {/* Offset is not here — for a PH curve it lives inside Generate
                (as the Laguerre slider). */}
          </div>
        </div>
      )}
    </div>
  )
}

// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
import { Icon } from '@iconify/react'
import { useSceneStore } from '../store/sceneStore'

export default function BottomBar() {
  const { curves, history, canUndo, canRedo, undo, redo, zoomIn, zoomOut, fitAll } =
    useSceneStore()

  // Only show if there are curves or history (user has done something)
  const hasActivity = curves.length > 0 || history.length > 0

  if (!hasActivity) return null

  return (
    <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center pointer-events-none z-40">
      {/* Undo/Redo */}
      <div className="flex gap-1 pointer-events-auto">
        <button
          onClick={undo}
          disabled={!canUndo()}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Undo"
          title="Undo (Cmd+Z)"
        >
          <svg
            className="w-5 h-5 text-gray-700 dark:text-gray-200"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
            />
          </svg>
        </button>

        <button
          onClick={redo}
          disabled={!canRedo()}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Redo"
          title="Redo (Cmd+Shift+Z)"
        >
          <svg
            className="w-5 h-5 text-gray-700 dark:text-gray-200"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
            />
          </svg>
        </button>
      </div>

      {/* Zoom controls */}
      <div className="flex gap-1 pointer-events-auto">
        <button
          onClick={zoomOut}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Icon icon="ant-design:zoom-out-outlined" className="w-5 h-5 text-gray-700 dark:text-gray-200" />
        </button>

        <button
          onClick={fitAll}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          aria-label="Fit all"
          title="Fit all curves in view"
        >
          <Icon icon="iconamoon:screen-full-light" className="w-6 h-6 text-gray-700 dark:text-gray-200" />
        </button>

        <button
          onClick={zoomIn}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Icon icon="ant-design:zoom-in-outlined" className="w-5 h-5 text-gray-700 dark:text-gray-200" />
        </button>
      </div>
    </div>
  )
}

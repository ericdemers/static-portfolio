// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import { isClampedEndKnot } from '../utils/bspline'

export default function RightContextMenu() {
  const { t } = useTranslation()
  const {
    curves,
    selectedCurveId,
    selectedKnotIndex,
    panelView,
    togglePanel,
    elevateCurveDegree,
    deleteCurve,
    removeKnotFromCurve,
    convertCurveType,
    transformActive,
    startTransform,
    commitTransform,
    phMetadata,
    startGenerate,
    generate,
  } = useSceneStore()

  const [transformExpanded, setTransformExpanded] = useState(false)

  const selectedCurve = curves.find((c) => c.id === selectedCurveId)

  // Check if we can delete the selected knot
  const canDeleteKnot = selectedCurve &&
    selectedKnotIndex !== null &&
    !isClampedEndKnot(selectedCurve.degree, selectedCurve.knots, selectedKnotIndex, selectedCurve.closed)

  // Only show when a curve is selected
  if (!selectedCurve) return null
  // During a Generate session, the GeneratePanel takes over.
  if (generate) return null

  // Check if the selected curve has PH metadata
  const hasPHMeta = selectedCurveId ? phMetadata.get(selectedCurveId) : null
  const hasABPHMeta = hasPHMeta && hasPHMeta.kind === 'ab-complex-rational'

  const inactiveBtn = 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
  const activeBtn = 'bg-purple-500 text-white'

  return (
    <div className="absolute top-16 right-3 z-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2 w-36">
      {/* Panel toggles */}
      <div className="flex flex-col gap-1 mb-2">
        <button
          onClick={() => togglePanel('basis')}
          className={`w-full h-8 rounded text-sm font-medium transition-colors ${
            panelView === 'basis'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {t('panels.basis')}
        </button>
        <button
          onClick={() => togglePanel('curvature')}
          className={`w-full h-8 rounded text-sm font-medium transition-colors ${
            panelView === 'curvature'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {t('panels.curvature')}
        </button>

        {/* PH curve: Generate (apply a Lie-sphere transform → a NEW curve).
            Non-PH: the in-place Transform. */}
        {hasABPHMeta ? (
          <button
            onClick={() => startGenerate(selectedCurveId)}
            className={`w-full h-8 rounded text-sm font-medium transition-colors ${inactiveBtn}`}
          >
            Generate
          </button>
        ) : (
          <button
            onClick={() => {
              if (transformActive) {
                commitTransform()
              } else {
                startTransform()
              }
            }}
            className={`w-full h-8 rounded text-sm font-medium transition-colors ${
              transformActive ? activeBtn : inactiveBtn
            }`}
          >
            {t('panels.transform')}
          </button>
        )}
      </div>

      <div className="h-px bg-gray-200 dark:bg-gray-700 my-2" />

      {/* Degree info and elevation */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">{t('actions.degree')}</span>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {selectedCurve.degree}
          </span>
          <button
            onClick={() => elevateCurveDegree(selectedCurve.id)}
            className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title="Elevate degree"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Delete curve or knot */}
      <button
        onClick={() => {
          if (canDeleteKnot) {
            removeKnotFromCurve(selectedCurve.id, selectedKnotIndex!)
          } else {
            deleteCurve(selectedCurve.id)
          }
        }}
        className="w-full h-8 flex items-center gap-2 px-2 rounded text-sm text-red-600 dark:text-red-400 bg-gray-100 dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
        title={canDeleteKnot ? "Delete knot" : "Delete curve"}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
        {canDeleteKnot ? t('actions.deleteKnot') : t('actions.delete')}
      </button>

      {/* Curve type — hidden for a PH curve (its type is fixed; Generate handles
          producing other curve kinds). */}
      {!hasABPHMeta && (<>
      <div className="h-px bg-gray-200 dark:bg-gray-700 my-2" />

      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('curveTypes.type')}</div>
      <div className="flex flex-col gap-1">
        <button
          onClick={() => convertCurveType(selectedCurve.id, 'bspline')}
          className={`w-full h-7 rounded text-xs font-medium transition-colors ${
            selectedCurve.kind === 'bspline'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {t('curveTypes.polynomial')}
        </button>
        <button
          onClick={() => convertCurveType(selectedCurve.id, 'rational')}
          className={`w-full h-7 rounded text-xs font-medium transition-colors ${
            selectedCurve.kind === 'rational'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {t('curveTypes.rational')}
        </button>
        <button
          onClick={() => convertCurveType(selectedCurve.id, 'complex-rational')}
          className={`w-full h-7 rounded text-xs font-medium transition-colors ${
            selectedCurve.kind === 'complex-rational'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {t('curveTypes.complex')}
        </button>
      </div>
      </>)}
    </div>
  )
}

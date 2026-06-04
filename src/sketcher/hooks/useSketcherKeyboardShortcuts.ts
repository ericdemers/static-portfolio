import { useEffect } from 'react'
import { useSceneStore } from '../store/sceneStore'
import { serializeScene, downloadScene, defaultSceneFilename, pickAndLoadScene } from '../utils/sceneFile'

export function useSketcherKeyboardShortcuts() {
  const { undo, redo, selectedCurveId, selectedKnotIndex, deleteCurve, selectCurve, transformActive, cancelTransform,
    curves, phMetadata, spatialCurves, loadScene } =
    useSceneStore()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd/Ctrl + Z = Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }

      // Cmd/Ctrl + Shift + Z = Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
      }

      // Cmd/Ctrl + Y = Redo (alternative)
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault()
        redo()
      }

      // Cmd/Ctrl + S = Save scene to a JSON file
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        downloadScene(serializeScene(curves, phMetadata, spatialCurves), defaultSceneFilename())
      }

      // Cmd/Ctrl + O = Load scene from a JSON file
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault()
        pickAndLoadScene((s) => loadScene(s.curves, s.phMetadata, s.spatialCurves))
      }

      // Escape = Cancel transform
      if (e.key === 'Escape' && transformActive) {
        e.preventDefault()
        cancelTransform()
        return
      }

      // Delete or Backspace = Delete selected curve (only if no knot is selected)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCurveId && selectedKnotIndex === null) {
        e.preventDefault()
        deleteCurve(selectedCurveId)
        selectCurve(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, selectedCurveId, selectedKnotIndex, deleteCurve, selectCurve, transformActive, cancelTransform,
    curves, phMetadata, spatialCurves, loadScene])
}

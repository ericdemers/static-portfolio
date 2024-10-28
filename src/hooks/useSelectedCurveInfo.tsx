import { useAppSelector } from "../app/hooks"
import { selectControlPolygonsDisplayed } from "../components/templates/sketcher/sketcherSlice"
import { Closed } from "../sketchElements/curveTypes"
import { selectCurves } from "../sketchElements/sketchElementsSlice"

/**
 * Custom hook to get information about the currently selected curve.
 *
 * @returns An object containing:
 *   - singleCurveSelected: boolean indicating if a single curve is selected
 *   - closedCurve: boolean indicating if the selected curve is closed
 */
export function useSelectedCurveInfo() {
  const controlPolygonsDisplayed = useAppSelector(
    selectControlPolygonsDisplayed,
  )
  const curves = useAppSelector(selectCurves)

  // Determine if a single curve is selected
  const singleCurveSelected =
    controlPolygonsDisplayed !== null &&
    controlPolygonsDisplayed.curveIDs.length === 1 &&
    curves.some(curve => curve.id === controlPolygonsDisplayed.curveIDs[0])

  // Determine if the selected curve is closed
  const closedCurve =
    singleCurveSelected &&
    curves.find(curve => curve.id === controlPolygonsDisplayed!.curveIDs[0])
      ?.closed === Closed.True

  return { singleCurveSelected, closedCurve }
}

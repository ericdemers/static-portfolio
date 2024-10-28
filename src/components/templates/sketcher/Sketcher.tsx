import { useEffect } from "react"
import { useAppDispatch, useAppSelector } from "../../../app/hooks"
import Canvas from "../../organisms/canvas/Canvas"
import CreationToolbar from "../../organisms/creationToolbar/CreationToolbar"
import MainMenu from "../../organisms/mainMenu/MainMenu"
import {
  selectControlPolygonsDisplayed,
  selectShowKnotVectorEditor,
  setSketcherSize,
} from "./sketcherSlice"
import { BottomMenu } from "../../organisms/bottomMenu/BottomMenu"
import RightMenu from "../../organisms/rightMenu/RightMenu"
import KnotVectorEditor from "../../organisms/knotVectorEditor/KnotVectorEditor"
import { selectCurves } from "../../../sketchElements/sketchElementsSlice"
import { Closed } from "../../../sketchElements/curveTypes"
import PeriodicKnotVectorEditor from "../../organisms/knotVectorEditor/PeriodicKnotVectorEditor"
import { useSelectedCurveInfo } from "../../../hooks/useSelectedCurveInfo"

interface SketcherProps {
  sketcherWidth: number
  sketcherHeight: number
}

/**
 * Sketcher component
 *
 * This component is the main container for the sketching application.
 * It manages the layout and conditional rendering of various sub-components.
 */
function Sketcher({ sketcherWidth, sketcherHeight }: Readonly<SketcherProps>) {
  const dispatch = useAppDispatch()
  const showKnotVectorEditor = useAppSelector(selectShowKnotVectorEditor)
  const controlPolygonsDisplayed = useAppSelector(
    selectControlPolygonsDisplayed,
  )
  const curves = useAppSelector(selectCurves)

  const { singleCurveSelected, closedCurve } = useSelectedCurveInfo()

  // Update sketcher size when dimensions change
  useEffect(() => {
    dispatch(setSketcherSize({ width: sketcherWidth, height: sketcherHeight }))
  }, [dispatch, sketcherHeight, sketcherWidth])

  return (
    <>
      <Canvas canvasWidth={sketcherWidth} canvasHeight={sketcherHeight} />
      <SketcherOverlay
        showRightMenu={!!controlPolygonsDisplayed?.curveIDs.length}
        showKnotVectorEditor={showKnotVectorEditor && singleCurveSelected}
        closedCurve={closedCurve}
      />
    </>
  )
}

interface SketcherOverlayProps {
  showRightMenu: boolean
  showKnotVectorEditor: boolean
  closedCurve: boolean
}

/**
 * SketcherOverlay component
 *
 * This component manages the overlay UI elements of the sketcher.
 */
function SketcherOverlay({
  showRightMenu,
  showKnotVectorEditor,
  closedCurve,
}: SketcherOverlayProps) {
  return (
    <div className="absolute left-4 right-4 bottom-6 top-6 pointer-events-none">
      <div className="flex flex-col h-full justify-between">
        <div className="grid grid-cols-[3fr_9fr_3fr] gap-1 pointer-events-none">
          <div className="pointer-events-auto">
            <MainMenu />
          </div>
          <div className="pointer-events-auto">
            <CreationToolbar />
          </div>
          {showRightMenu && (
            <div className="flex col-start-3 row-start-2 justify-end pointer-events-auto">
              <RightMenu />
            </div>
          )}
        </div>
        {showKnotVectorEditor && (
          <div className="absolute top-2/3 left-1/3 right-[5%] bottom-[5%] pointer-events-none">
            {closedCurve ? <PeriodicKnotVectorEditor /> : <KnotVectorEditor />}
          </div>
        )}
        <BottomMenu />
      </div>
    </div>
  )
}

export default Sketcher

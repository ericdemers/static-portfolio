import { useEffect } from "react"
import { useAppDispatch, useAppSelector } from "../../../app/hooks"
import Canvas from "../../organisms/canvas/Canvas"
import CreationToolbar from "../../organisms/creationToolbar/CreationToolbar"
import MainMenu from "../../organisms/mainMenu/MainMenu"
import {
  selectControlPolygonsDispayed,
  selectShowKnotVectorEditor,
  setSketcherSize,
} from "./sketcherSlice"
import { BottomMenu } from "../../organisms/bottomMenu/BottomMenu"
import RightMenu from "../../organisms/rightMenu/RightMenu"
import KnotVectorEditor from "../../organisms/knotVectorEditor/KnotVectorEditor"
import { selectCurves } from "../../../sketchElements/sketchElementsSlice"

interface SketcherProps {
  sketcherWidth: number
  sketcherHeight: number
}

function Sketcher(props: Readonly<SketcherProps>) {
  const { sketcherWidth, sketcherHeight } = props
  const dispatch = useAppDispatch()
  const showKnotVectorEditor = useAppSelector(selectShowKnotVectorEditor)
  const controlPolygonsDisplayed = useAppSelector(selectControlPolygonsDispayed)

  const curves = useAppSelector(selectCurves)

  const singleCurveSelected =
    controlPolygonsDisplayed !== null &&
    curves.find(curve => curve.id === controlPolygonsDisplayed.curveIDs[0]) &&
    controlPolygonsDisplayed.curveIDs.length === 1

  useEffect(() => {
    dispatch(setSketcherSize({ width: sketcherWidth, height: sketcherHeight }))
  }, [dispatch, sketcherHeight, sketcherWidth])

  return (
    <>
      <Canvas canvasWidth={sketcherWidth} canvasHeight={sketcherHeight} />
      <div className="absolute left-4 right-4 bottom-6 top-6 pointer-events-none">
        <div className="flex flex-col h-full justify-between">
          <div className="grid grid-cols-[3fr_9fr_3fr] gap-1 pointer-events-none">
            <div className="pointer-events-auto">
              <MainMenu />
            </div>
            <div className="pointer-events-auto">
              <CreationToolbar />
            </div>
            {controlPolygonsDisplayed?.curveIDs.length &&
            controlPolygonsDisplayed?.curveIDs.length > 0 ? (
              <div className="flex col-start-3 row-start-2 justify-end pointer-events-auto">
                <RightMenu />
              </div>
            ) : null}
          </div>
          {showKnotVectorEditor && singleCurveSelected ? (
            <div className="absolute top-2/3 left-1/3 right-[5%] bottom-[5%] pointer-events-none">
              <KnotVectorEditor />
            </div>
          ) : null}
          <BottomMenu />
        </div>
      </div>
    </>
  )
}

export default Sketcher

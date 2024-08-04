import { useEffect } from "react"
import { useAppDispatch } from "../../../app/hooks"
import Canvas from "../../organisms/canvas/Canvas"
import CreationToolbar from "../../organisms/creationToolbar/CreationToolbar"
import MainMenu from "../../organisms/mainMenu/MainMenu"
import { setSketcherSize } from "./sketcherSlice"
import { BottomMenu } from "../../organisms/bottomMenu/BottomMenu"

interface SketcherProps {
  sketcherWidth: number
  sketcherHeight: number
}

function Sketcher(props: Readonly<SketcherProps>) {
  const { sketcherWidth, sketcherHeight } = props
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(setSketcherSize({ width: sketcherWidth, height: sketcherHeight }))
  }, [dispatch, sketcherHeight, sketcherWidth])

  return (
    <>
      <Canvas canvasWidth={sketcherWidth} canvasHeight={sketcherHeight} />
      <div className="absolute left-4 right-4 bottom-6 top-4 pointer-events-none">
        <div className="flex flex-col h-full justify-between">
          <div className="grid grid-cols-3 gap-8 pointer-events-auto">
            <MainMenu />
            <CreationToolbar />
          </div>
          <BottomMenu />
        </div>
      </div>
    </>
  )
}

export default Sketcher

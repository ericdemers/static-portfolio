import Sketcher from "../components/templates/sketcher/Sketcher"
import { useWindowSize } from "../hooks/useWindowSize"

function SketcherPage() {
  const [windowWidth, windowHeight] = useWindowSize()
  const sketcherSize = {
    width: 100,
    height: 100,
  }

  const sketcherSizeCSS = {
    width: sketcherSize.width + "%",
    height: sketcherSize.height + "%",
  }

  return (
    <div style={sketcherSizeCSS} className="relative">
      <Sketcher
        sketcherWidth={(windowWidth * sketcherSize.width) / 100}
        sketcherHeight={(windowHeight * sketcherSize.height) / 100}
      />
    </div>
  )
}

export default SketcherPage

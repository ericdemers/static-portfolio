import Sketcher from "../components/templates/sketcher/Sketcher"
import { useWindowSize } from "../hooks/useWindowSize"

/**
 * SketcherPage component
 *
 * This component renders the main sketcher page, which includes the Sketcher component.
 * It uses the full window size and adjusts the Sketcher dimensions accordingly.
 */
function SketcherPage() {
  // Get the current window dimensions
  const [windowWidth, windowHeight] = useWindowSize()

  // Define the sketcher size as a percentage of the window
  const sketcherSize: { width: number; height: number } = {
    width: 100, // 100% of window width
    height: 100, // 100% of window height
  }

  // Convert percentage to CSS string
  const sketcherSizeCSS = {
    width: `${sketcherSize.width}%`,
    height: `${sketcherSize.height}%`,
  }

  // Calculate actual sketcher dimensions in pixels
  const sketcherWidth = (windowWidth * sketcherSize.width) / 100
  const sketcherHeight = (windowHeight * sketcherSize.height) / 100

  return (
    <div style={sketcherSizeCSS} className="relative">
      <Sketcher sketcherWidth={sketcherWidth} sketcherHeight={sketcherHeight} />
    </div>
  )
}

export default SketcherPage

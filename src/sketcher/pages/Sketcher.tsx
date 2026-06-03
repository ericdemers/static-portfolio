// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
import HamburgerMenu from '../components/HamburgerMenu'
import PencilTool from '../components/PencilTool'
import BottomBar from '../components/BottomBar'
import BottomPanel from '../components/BottomPanel'
import RightContextMenu from '../components/RightContextMenu'
import SketcherCanvas from '../components/SketcherCanvas'
import { useSketcherKeyboardShortcuts } from '../hooks/useSketcherKeyboardShortcuts'

export default function Sketcher() {
  useSketcherKeyboardShortcuts()

  return (
    <div className="h-screen w-screen overflow-hidden bg-white dark:bg-gray-900 relative">
      {/* Main canvas */}
      <SketcherCanvas />

      {/* UI overlays */}
      <HamburgerMenu />
      <PencilTool />
      <RightContextMenu />
      <BottomPanel />
      <BottomBar />
    </div>
  )
}

// Being migrated to core/ incrementally; remove this once a file is on core.
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import HamburgerMenu from '../components/HamburgerMenu'
import PencilTool from '../components/PencilTool'
import BottomBar from '../components/BottomBar'
import BottomPanel from '../components/BottomPanel'
import RightContextMenu from '../components/RightContextMenu'
import GeneratePanel from '../components/GeneratePanel'
import SketcherCanvas from '../components/SketcherCanvas'
import { useSketcherKeyboardShortcuts } from '../hooks/useSketcherKeyboardShortcuts'
import { isPhone } from '../../lib/device'

export default function Sketcher() {
  useSketcherKeyboardShortcuts()

  const navigate = useNavigate()
  useEffect(() => {
    // The full editor is unusable on a phone — send phones to the minimal
    // /sketch. ?full bypasses (to inspect the full editor on a phone).
    if (new URLSearchParams(window.location.search).has('full')) return
    if (isPhone()) navigate('/sketch', { replace: true })
  }, [navigate])

  return (
    <div className="h-screen w-screen overflow-hidden bg-white dark:bg-gray-900 relative">
      {/* Main canvas */}
      <SketcherCanvas />

      {/* UI overlays */}
      <HamburgerMenu />
      <PencilTool />
      <RightContextMenu />
      <GeneratePanel />
      <BottomPanel />
      <BottomBar />
    </div>
  )
}

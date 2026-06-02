import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Talks from './pages/Talks'
import Talk from './pages/Talk'
import ComingSoon from './pages/ComingSoon'

/**
 * App — top-level router.
 *
 * Only the home page exists so far. Everything the home page links to
 * (Sketcher, Presentation, Lab) is ported in from ../sketcher incrementally;
 * until each lands, the catch-all route shows a graceful placeholder rather
 * than a dead end.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/talks" element={<Talks />} />
        <Route path="/talks/:slug" element={<Talk />} />
        <Route path="*" element={<ComingSoon />} />
      </Routes>
    </BrowserRouter>
  )
}

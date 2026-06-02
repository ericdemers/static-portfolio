import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import ComingSoon from './pages/ComingSoon'

// The talk pulls in KaTeX + the optimizer; lazy-load so the home page bundle
// stays small and that weight is only fetched when viewing the presentation.
const Talks = lazy(() => import('./pages/Talks'))
const Talk = lazy(() => import('./pages/Talk'))

function Loading() {
  return <div className="min-h-screen bg-steelblue-900" />
}

/**
 * App — top-level router. Curated pieces are ported in from ../sketcher
 * incrementally; until each lands, the catch-all shows a graceful placeholder.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/talks" element={<Talks />} />
          <Route path="/talks/:slug" element={<Talk />} />
          <Route path="*" element={<ComingSoon />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

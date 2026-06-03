import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Lab from './pages/Lab'
import ComingSoon from './pages/ComingSoon'

// The talk pulls in KaTeX + the optimizer; lazy-load so the home page bundle
// stays small and that weight is only fetched when viewing the presentation.
const Talks = lazy(() => import('./pages/Talks'))
const Talk = lazy(() => import('./pages/Talk'))
// The full 2D editor (imported from ../sketcher) + its engine + i18n — lazy so
// none of it touches the home/talk bundles.
const Sketcher = lazy(() => import('./sketcher'))
// The Lie Sphere Workbench (linked from the PH-curves slide): the PH meridian
// editor + its revolved canal surface and Lie-transform sliders. Pulls in
// three.js, so lazy-load it too.
const LabLieSphere = lazy(() => import('./sketcher/pages/LabLieSphere'))

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
          <Route path="/sketcher" element={<Sketcher />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="/lab/lie-sphere" element={<LabLieSphere />} />
          <Route path="*" element={<ComingSoon />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

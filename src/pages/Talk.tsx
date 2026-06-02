import { Link } from 'react-router-dom'
import CurvatureDemo from '../components/CurvatureDemo'

/**
 * The Curves & Surfaces 2026 talk. The full deck will be ported in
 * incrementally; this first interactive slide is driven entirely by src/core/.
 */
export default function Talk() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-steelblue-900 to-steelblue-200 px-6 py-12">
      <div className="max-w-5xl mx-auto">
        <Link to="/talks" className="text-white/40 hover:text-neutral-300 text-sm tracking-widest font-thin">
          ← Presentations
        </Link>

        <h1 className="text-white text-2xl md:text-3xl font-thin tracking-wide mt-6">
          Interactive Control of Curvature Extrema and Inflections on B-Spline Curves
        </h1>
        <div className="text-white/50 text-sm mt-2 mb-10">
          Eric Demers, François Guibault, Jean-Claude Léon · Polytechnique Montréal · Curves &amp; Surfaces 2026
        </div>

        <h2 className="text-white/90 text-xl font-light mb-2">The variation-diminishing bound</h2>
        <p className="text-white/60 text-sm max-w-3xl mb-6 leading-relaxed">
          The curvature-extrema numerator g(t) is a B-spline function. By Schoenberg&apos;s
          variation-diminishing property, the number of sign changes in its Bernstein
          coefficients bounds the number of curvature extrema on the curve — the foundation
          of the anchor theorem.
        </p>

        <CurvatureDemo />
      </div>
    </div>
  )
}

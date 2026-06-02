import { Link } from 'react-router-dom'

/** Presentations index. New talks get added here. */
export default function Talks() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-steelblue-900 to-steelblue-200 px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="text-white/40 hover:text-neutral-300 text-sm tracking-widest font-thin">
          ← Numeric Elements
        </Link>
        <h1 className="text-white text-3xl md:text-4xl font-thin tracking-widest mt-6 mb-10">
          Presentations
        </h1>

        <Link
          to="/talks/cs2026"
          className="block rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-6"
        >
          <div className="text-white text-xl font-light">
            Interactive Control of Curvature Extrema and Inflections on B-Spline Curves
          </div>
          <div className="text-white/50 mt-2 text-sm">
            Curves &amp; Surfaces 2026 — St-Malo, France
          </div>
        </Link>
      </div>
    </div>
  )
}

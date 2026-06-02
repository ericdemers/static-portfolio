import { Link } from 'react-router-dom'
import SlideDeck from '../talks/SlideDeck'
import { slides } from '../talks/cs2026/slides'

/**
 * The Curves & Surfaces 2026 talk, as a navigable slide deck (← / → keys).
 * Static narrative + the live, core-powered sliding demo. The closed-curve
 * interactive demos are placeholders until their problem variants are ported.
 */
export default function Talk() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-steelblue-900 to-steelblue-200 px-4 py-6">
      <div className="max-w-5xl mx-auto">
        <Link to="/talks" className="text-white/40 hover:text-neutral-300 text-sm tracking-widest font-thin">
          ← Presentations
        </Link>
        <div className="mt-4">
          <SlideDeck slides={slides} />
        </div>
      </div>
    </div>
  )
}

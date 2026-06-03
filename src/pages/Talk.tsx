import { Link } from 'react-router-dom'
import RevealPresentation from '../talks/framework/RevealPresentation'
import { slides } from '../talks/cs2026/slides'

/**
 * The Curves & Surfaces 2026 talk, rendered with reveal.js (white theme) —
 * the exact deck look. Static slides + the live core-powered sliding demo;
 * closed-curve / dataset demos are placeholders until their problem variants
 * are ported.
 */
export default function Talk() {
  return (
    <>
      <Link
        to="/talks"
        className="fixed top-3 left-4 z-[60] text-slate-400 hover:text-slate-700 text-sm tracking-wide"
      >
        ← Presentations
      </Link>
      <RevealPresentation slides={slides} />
    </>
  )
}

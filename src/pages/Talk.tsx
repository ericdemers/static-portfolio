import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import RevealPresentation from '../talks/framework/RevealPresentation'
import { slides } from '../talks/cs2026/slides'

const PDF_URL = '/talks/cs2026.pdf'

/**
 * On a phone the interactive reveal.js deck is unusable, so redirect to the
 * static PDF. Targets phones specifically: a coarse pointer AND a small device
 * (shortest screen edge ≤ 480px) — excludes tablets and touch laptops.
 * `?interactive` bypasses it (e.g. to demo the live deck on a phone). Uses a
 * full-page navigation (not React Router) so the static PDF file is served.
 */
function isPhone(): boolean {
  if (new URLSearchParams(window.location.search).has('interactive')) return false
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const small = Math.min(window.screen.width, window.screen.height) <= 480
  return coarse && small
}

/**
 * The Curves & Surfaces 2026 talk, rendered with reveal.js (white theme) —
 * the exact deck look. Static slides + the live core-powered sliding demo;
 * closed-curve / dataset demos are placeholders until their problem variants
 * are ported.
 */
export default function Talk() {
  useEffect(() => {
    if (isPhone()) window.location.replace(PDF_URL)
  }, [])

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

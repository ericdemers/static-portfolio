import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import RevealPresentation from '../talks/framework/RevealPresentation'
import { slides } from '../talks/cs2026/slides'
import { isPhone } from '../lib/device'

const PDF_URL = '/talks/cs2026.pdf'
// Canonical presentations URL — used for the PDF export's back-link (see below).
const PRESENTATIONS_URL = 'https://numericelements.com/talks'
const BACK_LINK_CLASS = 'fixed top-3 left-4 z-[60] text-slate-400 hover:text-slate-700 text-sm tracking-wide'

/**
 * The Curves & Surfaces 2026 talk, rendered with reveal.js (white theme) —
 * the exact deck look. Static slides + the live core-powered sliding demo;
 * closed-curve / dataset demos are placeholders until their problem variants
 * are ported.
 */
export default function Talk() {
  // ?interactive marks the PDF export (decktape) and the phone live-deck demo.
  // In that mode the page is served from a throwaway origin (localhost while the
  // PDF is generated), so a react-router relative link would bake a localhost URL
  // into the PDF. Use the canonical absolute URL there; keep the SPA link live.
  const interactive = new URLSearchParams(window.location.search).has('interactive')

  useEffect(() => {
    if (interactive) return // bypass the phone→PDF redirect
    if (isPhone()) window.location.replace(PDF_URL)
  }, [interactive])

  return (
    <>
      {interactive ? (
        <a href={PRESENTATIONS_URL} className={BACK_LINK_CLASS}>← Presentations</a>
      ) : (
        <Link to="/talks" className={BACK_LINK_CLASS}>← Presentations</Link>
      )}
      <RevealPresentation slides={slides} />
    </>
  )
}

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import './slides.css'

export interface Slide {
  type?: 'title' | 'content'
  content: ReactNode
}

/**
 * Minimal, dependency-free slide deck: arrow-key / click navigation, a slide
 * counter, and title vs content layouts. Keeps the presentation independent of
 * reveal.js while matching the cs2026 deck's structure.
 */
export default function SlideDeck({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0)
  const go = (d: number) => setI((v) => Math.min(slides.length - 1, Math.max(0, v + d)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') go(1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1)
      else if (e.key === 'Home') setI(0)
      else if (e.key === 'End') setI(slides.length - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length])

  const slide = slides[i]

  return (
    <div className="deck">
      <div className={`slide ${slide.type === 'title' ? 'slide-title' : 'slide-content'}`} key={i}>
        {slide.content}
      </div>

      <div className="deck-bar">
        <button onClick={() => go(-1)} disabled={i === 0} aria-label="Previous">
          ‹
        </button>
        <span className="deck-counter">
          {i + 1} / {slides.length}
        </span>
        <button onClick={() => go(1)} disabled={i === slides.length - 1} aria-label="Next">
          ›
        </button>
      </div>
    </div>
  )
}

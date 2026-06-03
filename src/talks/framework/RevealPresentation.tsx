import { useReveal } from './useReveal'
import './reveal-overrides.css'
import type { SlideDefinition } from './types'

/**
 * Renders a deck with reveal.js and the white theme (exactly the sketcher's
 * look, via reveal-overrides.css). Slim version: title/content slides only —
 * the cs2026 demos are embedded inside `content`, so there's no sketcher-canvas
 * overlay coupling here.
 */
export default function RevealPresentation({ slides }: { slides: SlideDefinition[] }) {
  const { containerRef } = useReveal()
  return (
    <div data-theme="light" className="fixed inset-0 z-50 bg-white" style={{ colorScheme: 'light' }}>
      <div ref={containerRef} className="reveal-container">
        <div className="reveal">
          <div className="slides">
            {slides.map((slide, i) => (
              <section key={i} className={slide.type === 'title' ? 'title-slide' : ''}>
                {slide.content}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

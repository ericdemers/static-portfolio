import { useEffect, useRef, useCallback } from 'react'
import Reveal from 'reveal.js'
import 'reveal.js/reveal.css'
import 'reveal.js/theme/white.css'

// Minimal surface of the reveal.js deck API we use (the published @types lag
// behind reveal 6's API, so we type just what we call).
interface RevealDeck {
  initialize(): Promise<void>
  on(event: string, cb: (e: { indexh: number }) => void): void
  configure(opts: Record<string, unknown>): void
  slide(indexh: number): void
  destroy(): void
}

interface UseRevealOptions {
  onSlideChange?: (indexh: number) => void
}

export function useReveal(options: UseRevealOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const deckRef = useRef<RevealDeck | null>(null)
  const onSlideChangeRef = useRef(options.onSlideChange)
  onSlideChangeRef.current = options.onSlideChange

  useEffect(() => {
    if (!containerRef.current) return
    const revealEl = containerRef.current.querySelector('.reveal') as HTMLElement
    if (!revealEl) return

    const deck = new Reveal(revealEl, {
      hash: false,
      history: false,
      controls: true,
      progress: true,
      center: false,
      slideNumber: true,
      width: '100%',
      height: '100%',
      margin: 0,
      transition: 'slide',
      keyboard: true,
      embedded: false,
    }) as unknown as RevealDeck

    deck.initialize().then(() => {
      deckRef.current = deck
      deck.on('slidechanged', (event) => onSlideChangeRef.current?.(event.indexh))
      onSlideChangeRef.current?.(0)
    })

    return () => {
      deck.destroy()
      deckRef.current = null
    }
  }, [])

  const disableKeyboard = useCallback(() => {
    deckRef.current?.configure({ keyboard: false })
  }, [])
  const enableKeyboard = useCallback(() => {
    deckRef.current?.configure({ keyboard: true })
  }, [])

  return { containerRef, deckRef, disableKeyboard, enableKeyboard }
}

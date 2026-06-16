import { Link } from 'react-router-dom'

/**
 * Home — the numericelements.com landing page.
 *
 * Animated gradient wordmark on a steelblue gradient, with a fade-in nav.
 * Small "exponent" marks give a math vibe — Sketcher^b-spline and
 * Source^github.
 */
export default function Home() {
  const itemClass = 'text-white/50 hover:text-neutral-300 transition-colors'
  // Exponent ("powered by") mark — proportional to its word, with normal
  // letter-spacing so it doesn't inherit the wordy `tracking-widest`.
  const expClass = 'ml-0.5 text-[0.45em] font-light text-white/40 tracking-normal align-super'

  return (
    <div className="bg-gradient-to-br from-steelblue-900 to-steelblue-200 min-h-screen">
      <div className="h-screen flex flex-col gap-12 items-center justify-center px-4">
        {/* Wordmark */}
        <div className="animate-pulse-logo">
          <div className="transform-gpu font-thin text-transparent text-5xl md:text-7xl bg-clip-text bg-logo-gradient drop-shadow-[1px_1px_1px_rgba(150,150,150,0.8)] tracking-widest text-center">
            Numeric Elements
          </div>
        </div>

        {/* Navigation */}
        <nav className="text-white text-2xl md:text-3xl font-thin tracking-widest">
          <ul className="flex flex-row flex-wrap items-baseline justify-center gap-10 md:gap-16">
            <li className={`animate-fade-in-up-2 ${itemClass}`}>
              <Link to="/sketcher">
                Sketcher<sup className={expClass}>b-spline</sup>
              </Link>
            </li>
            <li className={`animate-fade-in-up-3 ${itemClass}`}>
              <Link to="/talks">Presentation</Link>
            </li>
            <li className={`animate-fade-in-up-4 ${itemClass}`}>
              <a href="https://github.com/numericelements">
                Source
                <sup className={expClass}>
                  <svg
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                    className="inline w-[1.6em] h-[1.6em]"
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                </sup>
              </a>
            </li>

            <li className={`animate-fade-in-up-5 ${itemClass}`}>
              <Link to="/lab">Lab</Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  )
}

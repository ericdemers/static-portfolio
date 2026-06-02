import { Link } from 'react-router-dom'

/**
 * ComingSoon — graceful placeholder for routes not yet ported from
 * ../sketcher (Sketcher, Presentation, Lab). Matches the home aesthetic.
 */
export default function ComingSoon() {
  return (
    <div className="bg-gradient-to-br from-steelblue-900 to-steelblue-200 min-h-screen">
      <div className="h-screen flex flex-col gap-8 items-center justify-center px-4 text-center">
        <div className="font-thin text-transparent text-4xl md:text-6xl bg-clip-text bg-logo-gradient tracking-widest">
          Coming soon
        </div>
        <Link
          to="/"
          className="text-white/50 hover:text-neutral-300 text-xl font-thin tracking-widest transition-colors"
        >
          ← Numeric Elements
        </Link>
      </div>
    </div>
  )
}

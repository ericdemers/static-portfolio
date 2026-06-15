import { Link } from 'react-router-dom'

/**
 * Lab — landing page for the interactive workbenches (reached from Home → More →
 * Lab). Each entry links to a standalone experiment; today that's the Lie Sphere
 * Workbench (the PH-curve canal surface from the cs2026 talk). Styled to match
 * the home page's steelblue gradient.
 */
const labs = [
  {
    to: '/lab/lie-sphere',
    title: 'Lie Sphere Workbench',
    blurb:
      'Edit a complex-rational PH curve and watch its revolved canal surface — Lie sphere transformations reshape the surface while preserving its ridges (the swept curvature extrema).',
  },
  {
    to: '/lab/ph2d',
    title: '2D PH Curvature Workbench',
    blurb:
      'Edit a planar Pythagorean-hodograph quintic with the sketcher and watch its curvature profile against a minimum-turning-radius bound — the planar companion to the 3D workbench.',
  },
  {
    to: '/lab/ph3d',
    title: '3D PH Curvature Workbench',
    blurb:
      'Drag the control points of a spatial Pythagorean-hodograph quintic with an exact arc length, and bound its curvature by a minimum turning radius — a smooth, curvature-limited 3D trajectory (e.g. for an underwater drone).',
  },
]

export default function Lab() {
  return (
    <div className="bg-gradient-to-br from-steelblue-900 to-steelblue-200 min-h-screen">
      <div className="min-h-screen flex flex-col gap-10 items-center justify-center px-4 py-16">
        <h1 className="font-thin text-transparent text-4xl md:text-6xl bg-clip-text bg-logo-gradient drop-shadow-[1px_1px_1px_rgba(150,150,150,0.8)] tracking-widest text-center">
          Lab
        </h1>

        <ul className="flex flex-col gap-6 w-full max-w-xl">
          {labs.map((lab) => (
            <li key={lab.to}>
              <Link
                to={lab.to}
                className="block rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 transition-colors p-6 backdrop-blur-sm"
              >
                <div className="text-white text-2xl font-thin tracking-wide flex items-center gap-2">
                  {lab.title}
                  <span aria-hidden="true" className="text-white/50 text-xl">
                    →
                  </span>
                </div>
                <p className="text-white/60 mt-2 font-light leading-relaxed">{lab.blurb}</p>
              </Link>
            </li>
          ))}
        </ul>

        <Link to="/" className="text-white/50 hover:text-neutral-300 transition-colors font-thin tracking-widest text-lg">
          ← Home
        </Link>
      </div>
    </div>
  )
}

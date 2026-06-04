import { useState } from 'react'
import type { SlideDefinition } from '../framework/types'
import Math from '../framework/Math'
import WorkbenchLink from '../framework/WorkbenchLink'
import ExtremumSlidingDemo from './ExtremumSlidingDemo'
import WithoutSlidingDemo from './WithoutSlidingDemo'
import WithoutSlidingPanel from './WithoutSlidingPanel'
import ExtremaFusionDemo from './ExtremaFusionDemo'
import FusionPanel from './FusionPanel'
import OvalDemo from './OvalDemo'
import OvoidDemo from './OvoidDemo'
import AirfoilDemo from './AirfoilDemo'
import DatasetGalaxy from './DatasetGalaxy'
import AirfoilFitGallery from './AirfoilFitGallery'
import ComplexRationalDemo from './ComplexRationalDemo'
import AllFlipDiagram from './AllFlipDiagram'
import WalkDiagram from './WalkDiagram'

/**
 * "Without Sliding" slide — owns the constraint-toggle state so the panel
 * button and the demo viewer stay in sync (controlled-state pattern).
 */
function WithoutSlidingSlideContent() {
  const [constrain, setConstrain] = useState(true)
  const [bound, setBound] = useState<number | null>(null)
  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      <div style={{ width: '32%', paddingRight: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <WithoutSlidingPanel constrainExtrema={constrain} onToggle={setConstrain} bound={bound} />
      </div>
      <div style={{ width: '68%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <WithoutSlidingDemo constrainExtrema={constrain} onBoundChange={setBound} />
      </div>
    </div>
  )
}

/**
 * "Extrema Fusion" slide (beat c) — sliding active set, with a Reset that
 * snaps the demo back to its initial polygon via a reset nonce.
 */
function ExtremaFusionSlideContent() {
  const [constrain, setConstrain] = useState(true)
  const [bound, setBound] = useState<number | null>(null)
  const [resetNonce, setResetNonce] = useState(0)
  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      <div style={{ width: '32%', paddingRight: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <FusionPanel
          constrainExtrema={constrain}
          onToggle={setConstrain}
          bound={bound}
          onReset={() => setResetNonce((n) => n + 1)}
        />
      </div>
      <div style={{ width: '68%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ExtremaFusionDemo constrainExtrema={constrain} onBoundChange={setBound} resetNonce={resetNonce} />
      </div>
    </div>
  )
}

/**
 * "Airfoil" slide — owns the x-axis symmetry toggle so the button and the
 * demo viewer stay in sync. Symmetric → NACA-style mirror enforced in the
 * solve; Free camber → no mirror, the curve can develop camber.
 */
function AirfoilSlideContent() {
  const [symmetric, setSymmetric] = useState(true)
  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      <div
        style={{
          width: '30%',
          padding: '40px 20px 40px 0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <h2 style={{ fontSize: '1.1em' }}>Airfoil</h2>
        <p>A closed curve with</p>
        <ul style={{ marginTop: '0.4em' }}>
          <li>
            <strong>4</strong> curvature extrema
          </li>
          <li>
            inflections <em>free</em>
          </li>
          <li>x-axis symmetry — toggleable</li>
        </ul>
        <div style={{ margin: '1em 0' }}>
          <button
            onClick={() => setSymmetric((s) => !s)}
            style={{
              padding: '8px 24px',
              fontSize: '0.9em',
              borderRadius: '6px',
              border: '1px solid #3b82f6',
              background: symmetric ? '#2563eb' : '#1e3a5f',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            {symmetric ? 'Symmetric' : 'Free camber'}
          </button>
        </div>
        <p style={{ marginTop: '0.5em', fontSize: '0.85em', color: '#94a3b8' }}>
          Drag any control point.
        </p>
      </div>
      <div
        style={{
          width: '70%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AirfoilDemo symmetric={symmetric} />
      </div>
    </div>
  )
}

export const slides: SlideDefinition[] = [
  {
    type: 'title',
    content: (
      <>
        <h1>Interactive Control of Curvature Extrema and Inflections on B-Spline Curves</h1>
        <div className="author">Eric Demers, François Guibault, Jean-Claude Léon</div>
        <div className="event">Polytechnique Montréal</div>
        <div className="event" style={{ marginTop: '2em' }}>
          Curves &amp; Surfaces 2026 — St-Malo, France
        </div>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>Outline</h2>
        <ol>
          <li>
            <strong>Sliding mechanism</strong>
            <br />
            <span style={{ opacity: 0.65 }}>Interactive editing under a curvature-extrema bound</span>
          </li>
          <li style={{ marginTop: '0.5em' }}>
            <strong>Closed curves</strong>
            <br />
            <span style={{ opacity: 0.65 }}>Ellipse, oval, ovoid, and the general 4-extrema shape space</span>
          </li>
          <li style={{ marginTop: '0.5em' }}>
            <strong>Complex rational B-splines</strong>
            <br />
            <span style={{ opacity: 0.65 }}>Möbius transformations</span>
          </li>
          <li style={{ marginTop: '0.5em' }}>
            <strong>PH curves</strong>
            <br />
            <span style={{ opacity: 0.65 }}>Lie sphere transformations</span>
          </li>
        </ol>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>
          Numerators of <Math>{'\\kappa'}</Math> and <Math>{"\\kappa'"}</Math>
        </h2>
        <p>
          For a planar B-spline curve{' '}
          <Math>{'\\mathbf{c}(t) = \\sum_i \\mathbf{P}_i\\, N_i^d(t)'}</Math>:
        </p>
        <ul>
          <li>
            <strong>Inflections</strong> — zeros of <Math>{'\\kappa'}</Math>, equivalently of{' '}
            <Math>{"f(t) = \\mathbf{c}'(t) \\times \\mathbf{c}''(t)"}</Math> (degree <Math>{'2d-3'}</Math>).
          </li>
          <li>
            <strong>Curvature extrema</strong> — zeros of <Math>{"\\kappa'"}</Math>, equivalently of{' '}
            <Math>{'g(t)'}</Math> (degree <Math>{'4d-6'}</Math>):
          </li>
        </ul>
        <Math display>
          {"g(t) = \\|\\mathbf{c}'\\|^2\\,(\\mathbf{c}' \\times \\mathbf{c}''') - 3\\,(\\mathbf{c}' \\cdot \\mathbf{c}'')\\,(\\mathbf{c}' \\times \\mathbf{c}'')"}
        </Math>
        <p style={{ opacity: 0.85 }}>
          Both <Math>{'f'}</Math> and <Math>{'g'}</Math> are piecewise polynomial — computable exactly in
          Bernstein form via B-spline algebra.
        </p>
      </>
    ),
  },

  {
    type: 'content',
    content: <WithoutSlidingSlideContent />,
  },

  {
    type: 'content',
    content: (
      <div style={{ display: 'flex', height: '100%', gap: 0 }}>
        <div
          style={{
            width: '32%',
            paddingRight: 24,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <h2 style={{ fontSize: '1.1em' }}>With Sliding</h2>
          <p>Drag the orange marker — the maximum of curvature.</p>
          <p style={{ marginTop: '0.6em' }}>
            Below: <Math>{'g(t)'}</Math>, the numerator of <Math>{"\\kappa'(t)"}</Math> — computable
            analytically. Its 11 Bernstein coefficients are shown (
            <span style={{ color: '#16a34a', fontWeight: 700 }}>+</span> /{' '}
            <span style={{ color: '#dc2626', fontWeight: 700 }}>−</span>); faded dots are inactive
            constraints, free to slide.
          </p>
          <p style={{ marginTop: '0.6em' }}>One sign change, moving with the extremum.</p>
        </div>
        <div style={{ width: '68%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ExtremumSlidingDemo width={800} height={580} />
        </div>
      </div>
    ),
  },

  {
    type: 'content',
    content: <ExtremaFusionSlideContent />,
  },

  {
    type: 'content',
    content: (
      <>
        <h2>Theorems</h2>
        <p style={{ marginTop: '0.5em' }}>
          <strong>Theorem 1</strong> (Schoenberg, variation diminishing). For a B-spline{' '}
          <Math>{'g = \\sum_i b_i\\, N_i'}</Math>,
        </p>
        <Math display>{'S^{-}(g) \\;\\leq\\; S^{-}(\\mathbf{b}).'}</Math>
        <p>
          Sign changes in the Bernstein coefficients <Math>{'(b_i)'}</Math> bound the number of curvature
          extrema.
        </p>
        <p style={{ marginTop: '1.0em' }}>
          <strong>Theorem 2</strong> (contribution). Under constrained editing with the sliding mechanism,{' '}
          <Math>{'S^{-}(\\mathbf{b})'}</Math> is <em>monotone non-increasing</em>.
        </p>
        <p style={{ marginTop: '1.0em' }}>
          <strong>Corollary.</strong> The bound on the number of curvature extrema can only stay the same or
          decrease — across every single edit.
        </p>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>Algorithm</h2>
        <p style={{ marginTop: '0.5em' }}>
          When the user drags control point <Math>{'\\mathbf{P}_k'}</Math> toward target{' '}
          <Math>{'\\mathbf{T}_k'}</Math>, solve:
        </p>
        <Math display>
          {'\\min_{\\mathbf{P}^*} \\;\\sum_i w_i\\,\\|\\mathbf{P}^*_i - \\mathbf{T}_i\\|^2 \\quad\\text{s.t.}\\quad s_j \\cdot g_j(\\mathbf{P}^*) \\geq 0,\\; j \\in \\mathcal{A}.'}
        </Math>
        <p>
          The active set <Math>{'\\mathcal{A}'}</Math>: positions with same-sign neighbors; one{' '}
          <strong>anchor</strong> per alternating sequence — the position with largest{' '}
          <Math>{'|g|'}</Math>. Solved by an interior-point method per drag step.
        </p>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>Alternating sequence <i>σ</i></h2>
        <p style={{ marginTop: '0.5em' }}>
          Inside an alternating sequence <Math>{"\\sigma"}</Math> of{' '}
          <Math>{"\\mathbf{b}"}</Math>:
        </p>
        <ul>
          <li>
            <strong>Interior</strong>: <Math>{"\\sigma"}</Math> already has
            the <em>maximum possible</em> sign-change count (every adjacent
            pair is a sign change). Any flip can only reduce or preserve
            interior sign changes.
          </li>
          <li>
            <strong>Junctions</strong>: <Math>{"\\sigma"}</Math>'s
            boundary pairs with the rest of the polygon are <em>not</em>{' '}
            sign changes. Each can <em>become</em> one if{' '}
            <Math>{"\\sigma"}</Math>'s endpoint flips, at most{' '}
            <Math>{"+1"}</Math> each.
          </li>
        </ul>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>All-flip</h2>
        <div
          style={{
            display: 'flex',
            gap: 16,
            marginTop: '0.5em',
            alignItems: 'flex-start',
            justifyContent: 'center',
          }}
        >
          <div style={{ flex: 1, maxWidth: '50%' }}>
            <AllFlipDiagram title="Interior σ" pattern={[+1, +1, -1, +1, -1, +1, +1]} sigma={{ start: 1, end: 5 }} />
          </div>
          <div style={{ flex: 1, maxWidth: '50%' }}>
            <AllFlipDiagram title="Boundary σ" pattern={[+1, +1, +1, -1, +1, -1, +1]} sigma={{ start: 2, end: 6 }} />
          </div>
        </div>
        <p style={{ marginTop: '0.5em', fontStyle: 'italic', opacity: 0.85, textAlign: 'center' }}>
          The only flip that grows <Math>{'S^{-}'}</Math> is <em>all-flip</em>. Excluding any single position
          of <Math>{'\\sigma'}</Math> from the flip — the <strong>anchor</strong> — blocks the all-flip.{' '}
          <Math>{'S^{-}'}</Math> does not grow.
        </p>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>Anchor lemma</h2>
        <div style={{ display: 'flex', gap: 24, marginTop: '0.5em', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, maxWidth: '52%' }}>
            <p>
              For any flip <Math>{"G \\subseteq \\sigma"}</Math> that
              leaves at least one sign fixed (the{' '}
              <strong>anchor</strong>),{' '}
              <Math>{"S^{-}(\\mathrm{flip}_G\\,\\mathbf{b}) \\leq S^{-}(\\mathbf{b})"}</Math>.
            </p>
            <p style={{ marginTop: '0.8em' }}>
              <em>Proof.</em> Encode the flip as a boolean pattern{' '}
              <Math>{"\\chi"}</Math> on <Math>{"\\sigma"}</Math>, 1 if
              sign is flipped, 0 otherwise.
            </p>
            <p style={{ marginTop: '0.6em' }}>
              Each <em>transition</em> of <Math>{"\\chi"}</Math> destroys
              one interior sign change; <Math>{"T(\\chi)"}</Math> counts
              the transitions.
            </p>
            <p style={{ textAlign: 'center', margin: '0.7em 0' }}>
              <Math display>{"S^{-}(\\mathrm{flip}_G\\,\\mathbf{b}) - S^{-}(\\mathbf{b}) \\;\\leq\\; \\chi(0) + \\chi(k-1) - T(\\chi)."}</Math>
            </p>
            <p style={{ marginTop: '0.6em' }}>
              With one anchor the right-hand side is{' '}
              <Math>{"\\leq 0"}</Math>. <Math>{"\\blacksquare"}</Math>
            </p>
          </div>
          <div style={{ flex: 1, maxWidth: '48%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <WalkDiagram />
          </div>
        </div>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>Multiple sequences</h2>
        <p style={{ marginTop: '0.5em' }}>
          For a polygon <Math>{"\\mathbf{b}"}</Math> with alternating
          sequences <Math>{"\\sigma_1, \\ldots, \\sigma_n"}</Math>,{' '}
          <strong>one anchor per sequence</strong> gives safety:{' '}
          <Math>{"S^{-}(\\mathrm{flip}\\,\\mathbf{b}) \\leq S^{-}(\\mathbf{b})"}</Math>.
        </p>
        <p style={{ marginTop: '0.8em' }}>
          <em>Proof.</em> Apply the anchor lemma to each{' '}
          <Math>{"\\sigma_i"}</Math> independently. A shared junction
          between adjacent <Math>{"\\sigma_i"}</Math> and{' '}
          <Math>{"\\sigma_{i+1}"}</Math> contributes via XOR:
        </p>
        <p style={{ textAlign: 'center', margin: '0.5em 0' }}>
          <Math display>{"\\chi_i(\\text{last}) \\oplus \\chi_{i+1}(0) \\;\\leq\\; \\chi_i(\\text{last}) + \\chi_{i+1}(0),"}</Math>
        </p>
        <p style={{ marginTop: '0.4em' }}>
          so the per-sequence bounds sum without double-counting. Each
          is <Math>{"\\leq 0"}</Math> by the anchor lemma, so the total
          is <Math>{"\\leq 0"}</Math>. <Math>{"\\blacksquare"}</Math>
        </p>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <div style={{ display: 'flex', height: '100%', gap: 0 }}>
        <div
          style={{
            width: '30%',
            padding: '40px 20px 40px 0',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <h2 style={{ fontSize: '1.1em' }}>Oval</h2>
          <p>A closed curve with</p>
          <ul style={{ marginTop: '0.4em' }}>
            <li>
              <strong>2</strong> axes of symmetry
            </li>
            <li>
              <strong>4</strong> curvature extrema
            </li>
            <li>
              <strong>0</strong> inflections
            </li>
          </ul>
          <p style={{ marginTop: '1em', fontSize: '0.85em', color: '#94a3b8' }}>
            Drag any control point.
          </p>
        </div>
        <div
          style={{
            width: '70%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <OvalDemo />
        </div>
      </div>
    ),
  },

  {
    type: 'content',
    content: (
      <div style={{ display: 'flex', height: '100%', gap: 0 }}>
        <div
          style={{
            width: '30%',
            padding: '40px 20px 40px 0',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <h2 style={{ fontSize: '1.1em' }}>Single axis of symmetry</h2>
          <p>A closed curve with</p>
          <ul style={{ marginTop: '0.4em' }}>
            <li>
              <strong>1</strong> axis of symmetry
            </li>
            <li>
              <strong>4</strong> curvature extrema
            </li>
            <li>
              inflections <em>free</em>
            </li>
          </ul>
          <p style={{ marginTop: '1em', fontSize: '0.85em', color: '#94a3b8' }}>
            Drag any control point.
          </p>
        </div>
        <div
          style={{
            width: '70%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <OvoidDemo />
        </div>
      </div>
    ),
  },

  {
    type: 'content',
    content: <AirfoilSlideContent />,
  },

  {
    type: 'content',
    content: (
      <div style={{ display: 'flex', height: '100%', gap: 0 }}>
        <div
          style={{
            width: '38%',
            padding: '40px 24px 40px 0',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <h2 style={{ fontSize: '1.1em' }}>The UIUC airfoil dataset</h2>
          <p style={{ marginTop: '0.4em' }}>
            <strong style={{ fontSize: '1.3em' }}>1644</strong> airfoils, same machinery.
          </p>
          <ul style={{ marginTop: '0.6em', fontSize: '0.9em' }}>
            <li>
              <strong style={{ color: '#16a34a', fontSize: '1.15em' }}>98.8%</strong> admit a
              4-curvature-extrema fit
            </li>
            <li style={{ marginTop: '0.3em' }}>
              median error <strong>0.13% chord</strong> (p90 = 0.38%)
            </li>
            <li style={{ marginTop: '0.3em' }}>
              <strong>0</strong> errors, <strong>0</strong> fits worsened by the constraint
            </li>
          </ul>
          <p style={{ marginTop: '0.8em', fontSize: '0.78em', color: '#94a3b8', fontStyle: 'italic' }}>
            Workflow: fair → fit with an interior-point optimizer → a primal–dual solve tightens the fit.
          </p>
        </div>
        <div
          style={{
            width: '62%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <DatasetGalaxy />
        </div>
      </div>
    ),
  },

  {
    type: 'content',
    content: (
      <div style={{ display: 'flex', height: '100%', gap: 0 }}>
        <div
          style={{
            width: '30%',
            padding: '40px 24px 40px 0',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <h2 style={{ fontSize: '1.1em' }}>How precise can we get?</h2>
          <p style={{ marginTop: '0.4em' }}>
            Open curve, trailing edge pinned — push the bounded fit to its limit.
          </p>
          <ul style={{ marginTop: '0.6em', fontSize: '0.9em' }}>
            <li>degree-5 B-spline · <em>Fair ↔ Fit</em> · primal–dual finish</li>
            <li style={{ marginTop: '0.3em' }}>
              1–2 curvature extrema, <strong style={{ color: '#34d399' }}>&lt; 0.1% chord</strong>
            </li>
          </ul>
          <p style={{ marginTop: '0.8em', fontSize: '0.78em', color: '#94a3b8', fontStyle: 'italic' }}>
            An AI-assisted algorithm-design experiment (Claude Code).
          </p>
        </div>
        <div
          style={{
            width: '70%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AirfoilFitGallery />
        </div>
      </div>
    ),
  },

  {
    type: 'content',
    content: (
      <ComplexRationalDemo>
        {({ panel, canvas }) => (
          <div style={{ display: 'flex', height: '100%', gap: 0 }}>
            <div
              style={{
                width: '30%',
                padding: '40px 20px 40px 0',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '1em',
              }}
            >
              <h2 style={{ fontSize: '1.1em' }}>Complex Rational B-spline</h2>
              <p style={{ fontSize: '0.85em', color: '#94a3b8' }}>
                Move the slider to apply Möbius transformation.
              </p>
              {panel}
            </div>
            <div
              style={{
                width: '70%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {canvas}
            </div>
          </div>
        )}
      </ComplexRationalDemo>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>PH curves &amp; Lie sphere transformations</h2>
        <p style={{ marginTop: '0.5em' }}>
          A <strong>complex-rational Pythagorean-hodograph</strong> curve{' '}
          <Math>{'z = A/B'}</Math> is built so its hodograph generator is a
          perfect square — <Math>{"A'B - AB' = S^2"}</Math> — making the speed{' '}
          <Math>{"|z'| = |S|^2/|B|^2"}</Math> rational. So it is PH{' '}
          <em>by construction</em>: rational offsets, rational arc length.
        </p>
        <ul style={{ marginTop: '0.4em' }}>
          <li>
            The same <Math>{"\\kappa'"}</Math> sign-change bound applies on the
            PH curve — edit the generator, the curvature-extrema count is
            monotone non-increasing.
          </li>
          <li style={{ marginTop: '0.3em' }}>
            Revolve it into a <strong>canal surface</strong>: its{' '}
            <strong>ridges</strong> (curvature extrema of the principal family)
            are exactly the curve's extrema, swept into rings.
          </li>
          <li style={{ marginTop: '0.3em' }}>
            <strong>Lie sphere transformations</strong> act linearly on the
            oriented-contact lift and <em>preserve ridges</em> — a further
            bound-preserving editing group, now on the surface.
          </li>
        </ul>
        <div style={{ marginTop: '1.4em' }}>
          <WorkbenchLink to="/lab/lie-sphere" talkSlug="cs2026">
            Open the Lie Sphere Workbench →
          </WorkbenchLink>
        </div>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>Conclusion</h2>
        <p style={{ fontWeight: 600 }}>
          Sign changes of <Math>{"\\kappa'"}</Math> and <Math>{'\\kappa'}</Math> are bounded — monotone
          non-increasing under editing.
        </p>
        <ol>
          <li><strong>Sliding mechanism + knot insertion</strong></li>
          <li style={{ marginTop: '0.4em' }}>
            <strong>Closed curves</strong> — the 4-extrema shape space: ellipse → oval → ovoid → general
          </li>
          <li style={{ marginTop: '0.4em' }}>
            <strong>Complex rational B-splines</strong> — Möbius transformations
          </li>
          <li style={{ marginTop: '0.4em' }}>
            <strong>PH curves</strong> — Lie sphere transformations
          </li>
        </ol>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>References</h2>
        <h3 style={{ fontSize: '0.9em', marginTop: '0.8em', color: '#374151' }}>
          Variation diminishing &amp; splines
        </h3>
        <ul style={{ fontSize: '0.8em', lineHeight: '1.5', marginTop: '0.3em' }}>
          <li>S. Karlin, <em>Total Positivity, Vol. I</em>. Stanford University Press, 1968.</li>
          <li>
            I.J. Schoenberg, "On spline functions," in O. Shisha (ed.), <em>Inequalities</em>, Academic Press,
            1967.
          </li>
          <li>
            L.L. Schumaker, <em>Spline Functions: Basic Theory</em>, 3rd ed. Cambridge Mathematical Library,
            2007.
          </li>
          <li>
            J.M. Lane, R.F. Riesenfeld, "A geometric proof for the variation diminishing property of B-spline
            approximation," <em>J. Approx. Theory</em> 37 (1983), 1–4.
          </li>
        </ul>
        <h3 style={{ fontSize: '0.9em', marginTop: '0.8em', color: '#374151' }}>
          Fairness &amp; curvature optimization
        </h3>
        <ul style={{ fontSize: '0.8em', lineHeight: '1.5', marginTop: '0.3em' }}>
          <li>
            N.S. Sapidis (ed.), <em>Designing Fair Curves and Surfaces: Shape Quality in Geometric Modeling
            and Computer-Aided Design</em>. SIAM, 1994. — incl. A.K. Jones, "Curvature integration through
            constrained optimization" (Ch. 2).
          </li>
          <li>
            É. Demers, C. Tribes, F. Guibault, "A selective eraser of curvature extrema for B-spline curves,"{' '}
            <em>Computers &amp; Graphics</em>, 2015.
          </li>
          <li>
            É. Demers, "Le contrôle des inflexions et des extremums de courbure portés par les courbes et les
            surfaces B-splines," PhD thesis, Polytechnique Montréal, 2017.
          </li>
        </ul>
      </>
    ),
  },

  {
    type: 'title',
    content: (
      <>
        <h1>Thank You</h1>
        <div className="author">Eric Demers, François Guibault, Jean-Claude Léon</div>
        <div className="event" style={{ marginTop: '0.5em' }}>Polytechnique Montréal</div>
        <div className="event" style={{ marginTop: '1.5em' }}>numericelements.com</div>
        <div className="event" style={{ marginTop: '2em' }}>Questions?</div>
      </>
    ),
  },

  // Backup
  {
    type: 'title',
    content: (
      <>
        <h1 style={{ fontSize: '1.6em' }}>Backup</h1>
        <div className="event" style={{ marginTop: '1em' }}>
          Exact sparse Jacobian of g — how editing stays interactive
        </div>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>Differentiating with Respect to a Control Point</h2>
        <p>
          A B-spline curve is <Math>{'\\mathbf{c}(t) = \\sum_j \\mathbf{P}_j \\, N_j(t)'}</Math>. Differentiate
          with respect to control point <Math>{'\\mathbf{P}_i'}</Math>:
        </p>
        <Math display>{'\\frac{\\partial \\mathbf{c}(t)}{\\partial \\mathbf{P}_i} = N_i(t)'}</Math>
        <p>
          This is itself a B-spline — same knots and degree, control points{' '}
          <Math>{'0,\\dots,0,1,0,\\dots,0'}</Math>. Its derivatives are lower-degree B-splines, nonzero on
          only <Math>{'d{+}1'}</Math> spans, computed once and cached.
        </p>
        <p>
          So <Math>{'\\partial g/\\partial \\mathbf{P}_i'}</Math> multiplies only on those{' '}
          <Math>{'d{+}1'}</Math> spans — exact, and 3–5× faster than automatic differentiation, which does not
          know what is zero. (Forward-mode AD over the Bernstein algebra in <code>core/gradient.ts</code>.)
        </p>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>The PH curve we edit: A, B, S</h2>
        <p>
          <strong>Complex-rational Pythagorean-hodograph</strong> splines are defined by{' '}
          <Math>{'z(t) = A(t)/B(t)'}</Math>, with <Math>{'A, B'}</Math> complex B-splines and a generator{' '}
          <Math>{'S'}</Math> enforcing the <em>PH condition</em>:
        </p>
        <Math display>{"A'B - AB' = S^2"}</Math>
        <p>
          The hodograph <Math>{"z' = S^2/B^2"}</Math> is a perfect square, so the square root inside the
          norm collapses:
        </p>
        <Math display>{"|z'| = \\sqrt{z'\\,\\overline{z'}} = \\sqrt{\\tfrac{S^2}{B^2}\\cdot\\tfrac{\\overline{S}^2}{\\overline{B}^2}} = \\sqrt{\\left(\\tfrac{S\\overline{S}}{B\\overline{B}}\\right)^2} = \\frac{S\\overline{S}}{B\\overline{B}}"}</Math>
        <p>
          The speed is <strong>rational</strong> — hence rational offsets.
        </p>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>Editing keeps it PH: a constrained solve</h2>
        <p>
          Both sides of the PH condition are degree <Math>{'2p-2'}</Math>, so they live in the same{' '}
          <strong>Bernstein basis</strong>. Equality means matching coefficients — equivalently, the residual
          must vanish:
        </p>
        <Math display>{"R = A'B - AB' - S^2 = 0 \\quad(\\text{every Bernstein coefficient})"}</Math>
        <p>
          So editing is a <strong>constrained optimization</strong>, not a formula. The control points{' '}
          <Math>{'A, B, S'}</Math> are <em>all</em> free (one weight <Math>{'B_0'}</Math> pinned as a gauge),
          and an interior-point solver moves them to:
        </p>
        <ul style={{ marginTop: '0.3em' }}>
          <li>
            <strong>minimize</strong> the distance from the dragged control point to the cursor,
          </li>
          <li style={{ marginTop: '0.25em' }}>
            <strong>subject to</strong> <Math>{'R = 0'}</Math> (stays a PH curve) and the sign constraints{' '}
            <Math>{'s_j\\, g_j \\ge 0'}</Math> (keeps the curvature-extrema count).
          </li>
        </ul>
        <p style={{ marginTop: '0.3em' }}>
          Letting <Math>{'S'}</Math> float alongside <Math>{'A, B'}</Math> is what lets the curve bend, rotate
          and scale freely while never leaving the PH family.
        </p>
      </>
    ),
  },
]

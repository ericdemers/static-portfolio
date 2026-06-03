import { useState } from 'react'
import type { SlideDefinition } from '../framework/types'
import Math from '../framework/Math'
import ExtremumSlidingDemo from './ExtremumSlidingDemo'
import WithoutSlidingDemo from './WithoutSlidingDemo'
import WithoutSlidingPanel from './WithoutSlidingPanel'

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

/** Placeholder for the closed-curve / dataset demos pending their core/ problem variants. */
function DemoPlaceholder({ label }: { label: string }) {
  return (
    <div
      style={{
        border: '1px dashed #cbd5e1',
        borderRadius: 12,
        padding: 40,
        textAlign: 'center',
        background: '#f8fafc',
        color: '#475569',
        height: '70%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ fontSize: '1.05em' }}>{label}</div>
      <div style={{ color: '#94a3b8', fontSize: '0.8em', marginTop: 8 }}>
        Interactive demo — porting onto <code>core/</code> (periodic / rational problem variant)
      </div>
    </div>
  )
}

/** Two-column demo slide: 30% text panel, 70% figure (matches the original layout). */
function DemoSlide({ panel, figure }: { panel: React.ReactNode; figure: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      <div style={{ width: '32%', paddingRight: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {panel}
      </div>
      <div style={{ width: '68%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {figure}
      </div>
    </div>
  )
}

/** A Bernstein sign pattern with the anchor highlighted. */
function SignRow({ pattern, anchor, title }: { pattern: number[]; anchor: number; title: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color: '#64748b', fontSize: '0.8em', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        {pattern.map((s, i) => (
          <div
            key={i}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              color: 'white',
              background: s > 0 ? '#16a34a' : '#dc2626',
              outline: i === anchor ? '3px solid #f59e0b' : 'none',
              outlineOffset: 2,
            }}
          >
            {s > 0 ? '+' : '−'}
          </div>
        ))}
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
        <h2>All-flip</h2>
        <div style={{ display: 'flex', gap: 60, justifyContent: 'center', margin: '1.5em 0' }}>
          <SignRow title="Interior σ" pattern={[1, 1, -1, 1, -1, 1, 1]} anchor={3} />
          <SignRow title="Boundary σ" pattern={[1, 1, 1, -1, 1, -1, 1]} anchor={3} />
        </div>
        <p style={{ textAlign: 'center', fontStyle: 'italic', opacity: 0.85 }}>
          The only flip that grows <Math>{'S^{-}'}</Math> is <em>all-flip</em>. Excluding any single position
          of <Math>{'\\sigma'}</Math> — the <strong style={{ color: '#d97706' }}>anchor</strong> — blocks the
          all-flip. <Math>{'S^{-}'}</Math> does not grow.
        </p>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>Anchor lemma</h2>
        <p>
          For any flip <Math>{'G \\subseteq \\sigma'}</Math> that leaves at least one sign fixed (the{' '}
          <strong>anchor</strong>), <Math>{'S^{-}(\\mathrm{flip}_G\\,\\mathbf{b}) \\leq S^{-}(\\mathbf{b})'}</Math>.
        </p>
        <p style={{ marginTop: '0.8em' }}>
          <em>Proof.</em> Encode the flip as a boolean pattern <Math>{'\\chi'}</Math> on{' '}
          <Math>{'\\sigma'}</Math>. Each transition of <Math>{'\\chi'}</Math> destroys one interior sign
          change; <Math>{'T(\\chi)'}</Math> counts the transitions.
        </p>
        <Math display>
          {'S^{-}(\\mathrm{flip}_G\\,\\mathbf{b}) - S^{-}(\\mathbf{b}) \\;\\leq\\; \\chi(0) + \\chi(k-1) - T(\\chi).'}
        </Math>
        <p>
          With one anchor the right-hand side is <Math>{'\\leq 0'}</Math>. <Math>{'\\blacksquare'}</Math>
        </p>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <DemoSlide
        panel={
          <>
            <h2 style={{ fontSize: '1.1em' }}>Oval</h2>
            <p>A closed curve with</p>
            <ul style={{ marginTop: '0.4em' }}>
              <li><strong>2</strong> axes of symmetry</li>
              <li><strong>4</strong> curvature extrema</li>
              <li><strong>0</strong> inflections</li>
            </ul>
          </>
        }
        figure={<DemoPlaceholder label="Oval — closed-curve sliding" />}
      />
    ),
  },

  {
    type: 'content',
    content: (
      <DemoSlide
        panel={
          <>
            <h2 style={{ fontSize: '1.1em' }}>Single axis of symmetry</h2>
            <p>A closed curve with</p>
            <ul style={{ marginTop: '0.4em' }}>
              <li><strong>1</strong> axis of symmetry</li>
              <li><strong>4</strong> curvature extrema</li>
              <li>inflections <em>free</em></li>
            </ul>
          </>
        }
        figure={<DemoPlaceholder label="Ovoid / peanut — closed-curve sliding" />}
      />
    ),
  },

  {
    type: 'content',
    content: (
      <DemoSlide
        panel={
          <>
            <h2 style={{ fontSize: '1.1em' }}>Airfoil</h2>
            <p>A closed curve with</p>
            <ul style={{ marginTop: '0.4em' }}>
              <li><strong>4</strong> curvature extrema</li>
              <li>inflections <em>free</em></li>
              <li>x-axis symmetry — toggleable</li>
            </ul>
          </>
        }
        figure={<DemoPlaceholder label="Airfoil — closed-curve sliding" />}
      />
    ),
  },

  {
    type: 'content',
    content: (
      <DemoSlide
        panel={
          <>
            <h2 style={{ fontSize: '1.1em' }}>The UIUC airfoil dataset</h2>
            <p>
              <strong style={{ fontSize: '1.2em' }}>1644</strong> airfoils, single workflow: <em>Fair → Fit</em>.
            </p>
            <ul style={{ marginTop: '0.6em', fontSize: '0.9em' }}>
              <li>
                <strong style={{ color: '#16a34a' }}>97.8%</strong> admit a 4-curvature-extrema fit
              </li>
              <li>median error <strong>0.35% chord</strong> (p90 = 0.61%)</li>
              <li><strong>0</strong> errors, <strong>0</strong> fits worsened by the constraint</li>
            </ul>
          </>
        }
        figure={<DemoPlaceholder label="UIUC dataset galaxy + open-curve precision gallery" />}
      />
    ),
  },

  {
    type: 'content',
    content: (
      <DemoSlide
        panel={
          <>
            <h2 style={{ fontSize: '1.1em' }}>Complex Rational B-spline</h2>
            <p style={{ fontSize: '0.9em', color: '#64748b' }}>
              Möbius transformations — a further bound-preserving editing technique. The numerator{' '}
              <Math>{'g'}</Math> is computed exactly via Chen complexity reduction (already in{' '}
              <code>core/</code>).
            </p>
          </>
        }
        figure={<DemoPlaceholder label="Complex-rational curve under Möbius transformations" />}
      />
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>PH curves &amp; Lie sphere transformations</h2>
        <p style={{ marginTop: '0.5em' }}>
          A <strong>Pythagorean-hodograph</strong> curve is built from a generating function{' '}
          <Math>{'S'}</Math> — the curve is <Math>{'\\textstyle\\int S^2'}</Math>, so it is PH by
          construction (rational offsets, rational arc length).
        </p>
        <ul style={{ marginTop: '0.4em' }}>
          <li>
            The same <Math>{"\\kappa'"}</Math> sign-change bound applies on the PH curve.
          </li>
          <li style={{ marginTop: '0.3em' }}>
            Revolve it into a <strong>canal surface</strong>: its ridges are exactly the curve's extrema,
            swept into rings.
          </li>
          <li style={{ marginTop: '0.3em' }}>
            <strong>Lie sphere transformations</strong> act linearly on the oriented-contact lift and preserve
            ridges.
          </li>
        </ul>
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
        <ul style={{ fontSize: '0.78em', lineHeight: '1.5' }}>
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
            T.N.T. Goodman, "A geometric proof for the variation diminishing property of B-spline
            approximation," <em>J. Approx. Theory</em> 50 (1987), 111–126.
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
]

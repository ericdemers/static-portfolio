import type { Slide } from '../SlideDeck'
import Math from '../Math'
import CurvatureDemo from '../../components/CurvatureDemo'

/** Placeholder for the closed-curve interactive demos still being ported onto core/. */
function DemoPlaceholder({ label }: { label: string }) {
  return (
    <div
      style={{
        border: '1px dashed #475569',
        borderRadius: 12,
        padding: 40,
        textAlign: 'center',
        background: '#0b1020',
        marginTop: 16,
      }}
    >
      <div style={{ color: '#cbd5e1', fontSize: '1.05em' }}>{label}</div>
      <div style={{ color: '#64748b', fontSize: '0.85em', marginTop: 8 }}>
        Interactive demo — porting onto <code>src/core/</code> (needs the periodic / rational problem variant)
      </div>
    </div>
  )
}

/** A small Bernstein-sign pattern with the anchor highlighted. */
function SignRow({ pattern, anchor, title }: { pattern: number[]; anchor: number; title: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color: '#94a3b8', fontSize: '0.9em', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        {pattern.map((s, i) => (
          <div
            key={i}
            style={{
              width: 34,
              height: 34,
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

export const slides: Slide[] = [
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
            <strong>Sliding mechanism</strong> — interactive editing under a curvature-extrema bound
          </li>
          <li>
            <strong>Closed curves</strong> — ellipse, oval, ovoid, and the 4-extrema shape space
          </li>
          <li>
            <strong>Complex rational B-splines</strong> — Möbius transformations
          </li>
          <li>
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
        <h2>
          Numerators of <Math>{'\\kappa'}</Math> and <Math>{"\\kappa'"}</Math>
        </h2>
        <p>
          For a planar B-spline curve{' '}
          <Math>{'\\mathbf{c}(t) = \\sum_i \\mathbf{P}_i\\, N_i^d(t)'}</Math>:
        </p>
        <ul>
          <li>
            <strong>Inflections</strong> — zeros of{' '}
            <Math>{'f(t) = \\mathbf{c}\' \\times \\mathbf{c}\'\''}</Math> (degree <Math>{'2d-3'}</Math>).
          </li>
          <li>
            <strong>Curvature extrema</strong> — zeros of <Math>{'g(t)'}</Math> (degree <Math>{'4d-6'}</Math>):
          </li>
        </ul>
        <Math display>
          {"g(t) = \\|\\mathbf{c}'\\|^2\\,(\\mathbf{c}' \\times \\mathbf{c}''') - 3\\,(\\mathbf{c}' \\cdot \\mathbf{c}'')\\,(\\mathbf{c}' \\times \\mathbf{c}'')"}
        </Math>
        <p style={{ opacity: 0.85 }}>
          Both <Math>{'f'}</Math> and <Math>{'g'}</Math> are piecewise polynomial — computed exactly in
          Bernstein form via B-spline algebra.
        </p>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>The sliding mechanism — live</h2>
        <p style={{ marginBottom: 4 }}>
          Drag a control point. With <strong>Constrained (sliding)</strong> on, the curve follows while{' '}
          <Math>{'S^-(g)'}</Math> — the bound on curvature extrema — stays monotone non-increasing.
        </p>
        <CurvatureDemo />
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>Theorems</h2>
        <p>
          <strong>Theorem 1</strong> (Schoenberg, variation diminishing). For{' '}
          <Math>{'g = \\sum_i b_i\\, N_i'}</Math>,
        </p>
        <Math display>{'S^{-}(g) \\;\\leq\\; S^{-}(\\mathbf{b}).'}</Math>
        <p>
          Sign changes in the Bernstein coefficients <Math>{'(b_i)'}</Math> bound the number of curvature
          extrema.
        </p>
        <p style={{ marginTop: '1em' }}>
          <strong>Theorem 2</strong> (contribution). Under constrained editing with the sliding mechanism,{' '}
          <Math>{'S^{-}(\\mathbf{b})'}</Math> is <em>monotone non-increasing</em>.
        </p>
        <p style={{ marginTop: '1em' }}>
          <strong>Corollary.</strong> The bound can only stay the same or decrease — across every edit.
        </p>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>Algorithm</h2>
        <p>
          When the user drags <Math>{'\\mathbf{P}_k'}</Math> toward target <Math>{'\\mathbf{T}_k'}</Math>,
          solve:
        </p>
        <Math display>
          {'\\min_{\\mathbf{P}^*} \\;\\sum_i w_i\\,\\|\\mathbf{P}^*_i - \\mathbf{T}_i\\|^2 \\quad\\text{s.t.}\\quad s_j \\cdot g_j(\\mathbf{P}^*) \\geq 0,\\; j \\in \\mathcal{A}.'}
        </Math>
        <p>
          The active set <Math>{'\\mathcal{A}'}</Math>: positions with same-sign neighbours, plus one{' '}
          <strong>anchor</strong> per alternating sequence (largest <Math>{'|g|'}</Math>). Solved by an
          interior-point method per drag step.
        </p>
        <p style={{ opacity: 0.7, fontSize: '0.9em' }}>
          (Exactly what the live demo runs — objective, constraints, and the exact sparse Jacobian all from{' '}
          <code>src/core/</code>.)
        </p>
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>All-flip &amp; the anchor</h2>
        <div style={{ display: 'flex', gap: 40, justifyContent: 'center', margin: '1.5em 0' }}>
          <SignRow title="Interior σ" pattern={[1, 1, -1, 1, -1, 1, 1]} anchor={3} />
          <SignRow title="Boundary σ" pattern={[1, 1, 1, -1, 1, -1, 1]} anchor={3} />
        </div>
        <p style={{ textAlign: 'center', fontStyle: 'italic', opacity: 0.85 }}>
          The only flip that grows <Math>{'S^{-}'}</Math> is the <em>all-flip</em>. Excluding one position —
          the <strong style={{ color: '#f59e0b' }}>anchor</strong> — blocks it, so <Math>{'S^{-}'}</Math> does
          not grow.
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
          For any flip <Math>{'G \\subseteq \\sigma'}</Math> that leaves at least one sign fixed (the
          anchor),
        </p>
        <Math display>{'S^{-}(\\mathrm{flip}_G\\,\\mathbf{b}) \\leq S^{-}(\\mathbf{b}).'}</Math>
        <p>
          <em>Proof.</em> Encode the flip as a boolean pattern <Math>{'\\chi'}</Math> on{' '}
          <Math>{'\\sigma'}</Math>. Each transition of <Math>{'\\chi'}</Math> destroys one interior sign
          change; with <Math>{'T(\\chi)'}</Math> transitions,
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
      <>
        <h2>Closed curves: the 4-extrema shape space</h2>
        <ul>
          <li>
            <strong>Oval</strong> — 2 axes of symmetry, 4 curvature extrema, 0 inflections
          </li>
          <li>
            <strong>Ovoid</strong> — 1 axis, 4 extrema, inflections free
          </li>
          <li>
            <strong>Airfoil</strong> — closed, 4 extrema, x-axis symmetry (toggleable)
          </li>
        </ul>
        <DemoPlaceholder label="Oval · Ovoid · Airfoil — closed-curve sliding" />
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>The UIUC airfoil dataset</h2>
        <p>
          <strong style={{ fontSize: '1.2em' }}>1644</strong> airfoils, one workflow (<em>Fair → Fit</em>):
        </p>
        <ul>
          <li>
            <strong style={{ color: '#16a34a' }}>97.8%</strong> admit a 4-curvature-extrema fit
          </li>
          <li>median error <strong>0.35% chord</strong> (p90 = 0.61%)</li>
          <li>
            <strong>0</strong> errors, <strong>0</strong> fits worsened by the constraint
          </li>
        </ul>
        <DemoPlaceholder label="UIUC dataset galaxy + open-curve precision gallery" />
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>Complex rational B-splines</h2>
        <p>
          Möbius transformations act on complex-rational curves and preserve the curvature-extrema bound — a
          further bound-preserving editing technique. The numerator <Math>{'g'}</Math> is computed exactly in
          Bernstein form (Chen complexity reduction), already in <code>src/core/</code>.
        </p>
        <DemoPlaceholder label="Complex-rational curve under Möbius transformations" />
      </>
    ),
  },

  {
    type: 'content',
    content: (
      <>
        <h2>PH curves &amp; Lie sphere transformations</h2>
        <p>
          A <strong>Pythagorean-hodograph</strong> curve is built from a generator <Math>{'S'}</Math> — the
          curve is <Math>{'\\textstyle\\int S^2'}</Math>, PH by construction.
        </p>
        <ul>
          <li>
            The same <Math>{"\\kappa'"}</Math> sign-change bound applies on the PH curve.
          </li>
          <li>
            Revolve it into a <strong>canal surface</strong>: its ridges are the curve's extrema, swept into
            rings.
          </li>
          <li>
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
          <li>
            <strong>Sliding mechanism + knot insertion</strong>
          </li>
          <li>
            <strong>Closed curves</strong> — ellipse → oval → ovoid → general
          </li>
          <li>
            <strong>Complex rational B-splines</strong> — Möbius transformations
          </li>
          <li>
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
        <ul style={{ fontSize: '0.85em', lineHeight: 1.5 }}>
          <li>S. Karlin, <em>Total Positivity, Vol. I</em>. Stanford University Press, 1968.</li>
          <li>
            I.J. Schoenberg, "On spline functions," in O. Shisha (ed.), <em>Inequalities</em>, Academic Press,
            1967.
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
            É. Demers, "Le contrôle des inflexions et des extremums de courbure…," PhD thesis, Polytechnique
            Montréal, 2017.
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
        <div className="event" style={{ marginTop: '0.5em' }}>
          Polytechnique Montréal
        </div>
        <div className="event" style={{ marginTop: '1.5em' }}>
          numericelements.com
        </div>
      </>
    ),
  },

  // ---- Backup: the exact sparse Jacobian ----
  {
    type: 'content',
    content: (
      <>
        <h2>Backup — exact sparse Jacobian of g</h2>
        <p>
          Differentiating the curve w.r.t. a control point gives a "Dirac" B-spline:
        </p>
        <Math display>{'\\frac{\\partial \\mathbf{c}(t)}{\\partial \\mathbf{P}_i} = N_i(t)'}</Math>
        <p>
          — same knots and degree, control points <Math>{'0,\\dots,0,1,0,\\dots,0'}</Math>. Its derivatives
          are lower-degree B-splines, nonzero on only <Math>{'d+1'}</Math> spans, cached once.
        </p>
        <p>
          So <Math>{'\\partial g/\\partial \\mathbf{P}_i'}</Math> multiplies only on those{' '}
          <Math>{'d+1'}</Math> spans — exact, and 3–5× faster than automatic differentiation, which does not
          know what is zero. (Implemented as forward-mode AD over the Bernstein algebra in{' '}
          <code>src/core/gradient.ts</code>.)
        </p>
      </>
    ),
  },
]

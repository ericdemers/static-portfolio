import { useState } from 'react'
import WithoutSlidingDemo from './WithoutSlidingDemo'
import WithoutSlidingPanel from './WithoutSlidingPanel'
import ExtremaFusionDemo from './ExtremaFusionDemo'
import FusionPanel from './FusionPanel'
import AirfoilDemo from './AirfoilDemo'

/**
 * Interactive slide-content components for the cs2026 deck. They own per-slide
 * UI state (toggles, reset nonces), so they live in their own file — keeping
 * slides.tsx a pure data module (which also satisfies react-refresh).
 */

/**
 * "Without Sliding" slide — owns the constraint-toggle state so the panel
 * button and the demo viewer stay in sync (controlled-state pattern).
 */
export function WithoutSlidingSlideContent() {
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
export function ExtremaFusionSlideContent() {
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
export function AirfoilSlideContent() {
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

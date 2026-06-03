import Math from '../framework/Math'

interface Props {
  /** Whether the bound is currently enforced. */
  constrainExtrema: boolean
  /** Called when the user toggles the constraint button. */
  onToggle: (next: boolean) => void
  /** Current sign-change count of g, or null when not enforcing. */
  bound: number | null
}

/**
 * Left text panel + bound-toggle button for the "Without Sliding" slide.
 * Fully controlled — state lives in the parent slide so the demo viewer
 * and the button stay in sync.
 */
export default function WithoutSlidingPanel({
  constrainExtrema,
  onToggle,
  bound,
}: Props) {
  return (
    <>
      <h2 style={{ fontSize: '1.1em' }}>Without Sliding</h2>
      <p>
        Drag any control point. The bound on the number of curvature extrema
        is preserved — but the sign-change boundary in <Math>{'g(t)'}</Math>{' '}
        is held rigid, so the extremum is{' '}
        <strong>locked in <Math>{'t'}</Math></strong>.
      </p>
      <p style={{ marginTop: '0.6em' }}>
        This is how it worked before the sliding mechanism.
      </p>
      <div style={{ margin: '1em 0' }}>
        <button
          onClick={() => onToggle(!constrainExtrema)}
          style={{
            padding: '8px 24px',
            fontSize: '0.9em',
            borderRadius: '6px',
            border: '1px solid #3b82f6',
            background: constrainExtrema ? '#2563eb' : '#1e3a5f',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          {constrainExtrema
            ? `Bound extrema${bound !== null ? ` (S = ${bound})` : ''}`
            : 'Free extrema'}
        </button>
      </div>
    </>
  )
}

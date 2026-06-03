import Math from '../framework/Math'

interface Props {
  constrainExtrema: boolean
  onToggle: (next: boolean) => void
  bound: number | null
  onReset: () => void
}

/**
 * Left text panel + bound-toggle button for the extrema-fusion slide
 * (beat c). Controlled — state lives in the parent slide.
 */
export default function FusionPanel({
  constrainExtrema,
  onToggle,
  bound,
  onReset,
}: Props) {
  return (
    <>
      <h2 style={{ fontSize: '1.1em' }}>Sliding and Annihilation</h2>
      <p>
        Three curvature extrema at the start. Drag the rightmost control
        point outward — two extrema slide toward each other and{' '}
        <strong>annihilate</strong>. The bound{' '}
        <Math>{'S(\\mathbf{b})'}</Math> drops.
      </p>
      <p style={{ marginTop: '0.6em' }}>
        The sliding mechanism makes <Math>{'S(\\mathbf{b})'}</Math>{' '}
        <em>monotone non-increasing</em>.
      </p>
      <div style={{ margin: '1em 0', display: 'flex', gap: '0.5em', flexWrap: 'wrap' }}>
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
        <button
          onClick={onReset}
          style={{
            padding: '8px 18px',
            fontSize: '0.9em',
            borderRadius: '6px',
            border: '1px solid #64748b',
            background: 'transparent',
            color: '#cbd5e1',
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </div>
    </>
  )
}

import { useNavigate } from 'react-router-dom'
import type { CSSProperties, ReactNode } from 'react'
import { getCurrentSlideIndex } from './slideNav'

interface Props {
  /** Destination route, e.g. '/lab/lie-sphere'. */
  to: string
  /** Talk slug to return to, e.g. 'cs2026'. */
  talkSlug: string
  children: ReactNode
  style?: CSSProperties
}

/**
 * A button placed inside a slide that opens an external page (e.g. the Lie
 * Sphere Workbench) and lets that page return to THIS slide. It passes the
 * live current slide index so the page's "Back to presentation" button can
 * navigate to /talks/<slug>?slide=N — RevealPresentation jumps the deck there.
 */
export default function WorkbenchLink({ to, talkSlug, children, style }: Props) {
  const navigate = useNavigate()
  const onClick = () => {
    const slide = getCurrentSlideIndex()
    const ret = encodeURIComponent(`/talks/${talkSlug}?slide=${slide}`)
    navigate(`${to}?return=${ret}`)
  }
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '10px 22px',
        fontSize: '0.95em',
        borderRadius: 8,
        border: '1px solid #3b82f6',
        background: '#2563eb',
        color: 'white',
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

import type { ReactNode } from 'react'

/**
 * A presentation slide. The cs2026 deck embeds its interactive demos directly
 * inside `content` (no separate sketcher-canvas overlay), so we only need
 * 'title' and 'content' here.
 */
export interface SlideDefinition {
  type: 'title' | 'content'
  content: ReactNode
  notes?: string
}

export interface TalkDefinition {
  slug: string
  title: string
  slides: SlideDefinition[]
}

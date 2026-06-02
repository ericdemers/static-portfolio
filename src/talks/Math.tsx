import katex from 'katex'
import 'katex/dist/katex.min.css'

/** Inline (default) or display LaTeX math, rendered with KaTeX. */
export default function Math({ children, display }: { children: string; display?: boolean }) {
  const html = katex.renderToString(children, { displayMode: !!display, throwOnError: false })
  return (
    <span
      style={display ? { display: 'block', margin: '0.6em 0', textAlign: 'center' } : undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

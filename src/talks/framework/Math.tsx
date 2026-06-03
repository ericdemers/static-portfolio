import katex from 'katex'
import 'katex/dist/katex.min.css'

interface Props {
  /** LaTeX string */
  children: string
  /** Display mode (centered, larger) vs inline */
  display?: boolean
}

export default function Math({ children, display = false }: Props) {
  const html = katex.renderToString(children, {
    displayMode: display,
    throwOnError: false,
  })
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

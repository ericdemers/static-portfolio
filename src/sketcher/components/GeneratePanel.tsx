import { useSceneStore } from '../store/sceneStore'
import { SHAPE_GENERATORS } from '../lab/lieSphere/lieAlgebra2D'

const GROUP_LABEL = { conformal: 'Conformal (Möbius)', laguerre: 'Laguerre', lie: 'Lie' }

export default function GeneratePanel() {
  const { generate, setGenerateCoeff, applyGenerate, resetGenerate, doneGenerate, cancelGenerate } = useSceneStore()
  if (!generate) return null
  const { coeffs } = generate

  const btn = 'flex-1 h-8 rounded text-sm font-medium transition-colors'
  const subtle = 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'

  // group the generators in order, keeping their global index for the coeff vector
  const groups: { group: string; items: { gen: typeof SHAPE_GENERATORS[number]; i: number }[] }[] = []
  SHAPE_GENERATORS.forEach((gen, i) => {
    let g = groups[groups.length - 1]
    if (!g || g.group !== gen.group) { g = { group: gen.group, items: [] }; groups.push(g) }
    g.items.push({ gen, i })
  })

  return (
    <div className="absolute top-16 right-3 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 w-60 max-h-[80vh] overflow-y-auto">
      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-0.5">Generate</div>
      <div className="text-xs text-gray-400 mb-2">Lie-sphere transform → new curve</div>

      {groups.map((g) => (
        <div key={g.group} className="mb-2">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{GROUP_LABEL[g.group as keyof typeof GROUP_LABEL]}</div>
          {g.items.map(({ gen, i }) => (
            <div key={gen.key} className="mb-1.5">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>{gen.label}</span>
                <span className="tabular-nums">{coeffs[i].toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={-1.5}
                max={1.5}
                step={0.01}
                value={coeffs[i]}
                onChange={(e) => setGenerateCoeff(i, parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          ))}
        </div>
      ))}

      <div className="flex gap-1 mt-1">
        <button className={`${btn} ${subtle}`} onClick={applyGenerate} title="Bake the current transform; keep composing">Apply</button>
        <button className={`${btn} ${subtle}`} onClick={resetGenerate}>Reset</button>
      </div>
      <div className="flex gap-1 mt-1">
        <button className={`${btn} bg-blue-500 text-white hover:bg-blue-600`} onClick={doneGenerate}>Done</button>
        <button className={`${btn} ${subtle}`} onClick={cancelGenerate}>Cancel</button>
      </div>
    </div>
  )
}

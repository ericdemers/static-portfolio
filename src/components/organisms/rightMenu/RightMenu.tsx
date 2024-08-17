import { useAppDispatch, useAppSelector } from "../../../app/hooks"
import { SimplifyIcon } from "../../../icons"
import {
  selectShowKnotVectorEditor,
  toggleShowKnotVectorEditor,
} from "../../templates/sketcher/sketcherSlice"

function RightMenu() {
  const dispatch = useAppDispatch()
  const showKnotVectorEditor = useAppSelector(selectShowKnotVectorEditor)

  const handleToggleShowKnotVectorEditor = () => {
    dispatch(toggleShowKnotVectorEditor())
  }

  return (
    <div className="w-12 flex flex-col  place-content-around bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-400 p-1 shadow rounded-lg select-none">
      <ul>
        <li>
          <button
            onClick={handleToggleShowKnotVectorEditor}
            className={`${showKnotVectorEditor ? "bg-blue-50" + " dark:bg-gray-600" : ""} hover:bg-neutral-100 dark:hover:bg-neutral-700 w-10 h-10 rounded-lg outline-none font-medium text-center`}
          >
            B
          </button>
        </li>
        <li>
          <button
            className={` hover:bg-neutral-100 dark:hover:bg-neutral-700 p-2 rounded-lg outline-none`}
          >
            <div className="size-6">{SimplifyIcon}</div>
          </button>
        </li>
      </ul>
    </div>
  )
}

export default RightMenu

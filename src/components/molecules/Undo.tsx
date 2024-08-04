import {
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
} from "@heroicons/react/24/outline"
import { useAppDispatch, useAppSelector } from "../../app/hooks"
import { ActionCreators } from "redux-undo"
import {
  selectCurves,
  selectShowRedoArrow,
  selectShowUndoArrow,
} from "../../sketchElements/sketchElementsSlice"

export const Undo = () => {
  const dispatch = useAppDispatch()
  const showUndo = useAppSelector(selectShowUndoArrow)
  const showRedo = useAppSelector(selectShowRedoArrow)
  return (
    <div className="pointer-events-auto">
      <button>
        <ArrowUturnLeftIcon
          onClick={() => {
            dispatch(ActionCreators.undo())
          }}
          className={`${!showUndo ? "invisible" : ""} w-9 text-neutral-600 dark:text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-full p-2 hover:shadow-inner hover:shadow-black/10 hover:dark:shadow-white/10 `}
        />
      </button>
      <button>
        <ArrowUturnRightIcon
          onClick={() => {
            dispatch(ActionCreators.redo())
          }}
          className={`${!showRedo ? "invisible" : ""} w-9 text-neutral-600 dark:text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-full p-2 hover:shadow-inner hover:shadow-black/10 hover:dark:shadow-white/10" `}
        />
      </button>
    </div>
  )
}

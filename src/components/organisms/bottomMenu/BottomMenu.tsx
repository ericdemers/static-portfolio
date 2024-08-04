import { Undo } from "../../molecules/Undo"
import { Zoom } from "../../molecules/Zoom"

export const BottomMenu = () => {
  return (
    <div className="flex gap-2 select-none">
      <div></div>
      <Zoom />
      <div></div>
      <div></div>
      <Undo />
    </div>
  )
}

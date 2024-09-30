import { useAppDispatch, useAppSelector } from "../../../app/hooks"
import { useTranslation } from "../../../hooks/useTranslation"
import { LanguageList } from "../../molecules/LanguageList"
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
} from "@headlessui/react"
import {
  Bars3Icon,
  ArrowDownTrayIcon,
  FolderOpenIcon,
  TrashIcon,
  MoonIcon,
  SunIcon,
} from "@heroicons/react/24/outline"
import {
  resetCanvas,
  selectTheme,
  setInitialView,
  toggleTheme,
  unselectCurvesAndCreationTool,
} from "../../templates/sketcher/sketcherSlice"
import {
  clearCurves,
  selectCurves,
  updateCurves,
} from "../../../sketchElements/sketchElementsSlice"
import { ActionCreators } from "redux-undo"
import { saveCurves } from "../../../renderer/SaveAndOpen"
import { useCallback } from "react"

function MainMenu() {
  const dispatch = useAppDispatch()
  const t = useTranslation()
  const theme = useAppSelector(selectTheme)
  const curves = useAppSelector(selectCurves)

  const openCurves = useCallback(
    (fileContent: string) => {
      const curves = JSON.parse(fileContent)
      dispatch(updateCurves({ curves }))
      dispatch(setInitialView({ show: false }))
      dispatch(unselectCurvesAndCreationTool())
    },
    [dispatch],
  )

  const readSingleFile = useCallback(
    (ev: Event) => {
      const fileReader = new FileReader()
      fileReader.onload = async () => {
        const fileContent = fileReader.result as string
        openCurves(fileContent)
      }
      if (ev.target === null) return
      let t = ev.target as HTMLInputElement
      if (t.files === null) return
      fileReader.readAsText(t.files[0])
      //t.files = null
    },
    [openCurves],
  )

  const handleDarkMode = () => {
    document.body.classList.toggle("dark")
    dispatch(toggleTheme())
  }

  const handleResetCanvas = () => {
    dispatch(resetCanvas())
    dispatch(clearCurves())
    dispatch(ActionCreators.clearHistory())
  }

  const handleSave = () => {
    saveCurves(curves)
  }

  const handleOpenFile = () => {
    const fileInput = document.getElementById("file")
    if (fileInput !== null) {
      fileInput.onclick = (e: Event) => {
        let t = e.target as HTMLInputElement
        t.value = ""
      }
      fileInput.addEventListener("change", readSingleFile, false)
      fileInput.click()
      //fileInput.removeEventListener('change', readSingleFile )
    }
  }

  return (
    <Menu>
      <div className="hidden">
        <input id="file" type="file" />
      </div>
      <MenuButton className="flex items-center justify-center hover:bg-neutral-50 dark:hover:bg-neutral-900 rounded-lg p-2  size-10  focus:outline-none hover:shadow-inner hover:shadow-black/10 hover:dark:shadow-white/10 ">
        <Bars3Icon className="text-neutral-600 dark:text-neutral-500 size-8" />
      </MenuButton>
      <Transition
        enter="transition ease-out duration-75"
        enterFrom="opacity-0 scale-95"
        enterTo="opacity-100 scale-100"
        leave="transition ease-in duration-100"
        leaveFrom="opacity-100 scale-100"
        leaveTo="opacity-0 scale-95"
      >
        <MenuItems
          anchor="bottom start"
          className="bg-white dark:bg-neutral-800 absolute mt-2 ml-0 text-gray-700 dark:text-neutral-400 shadow-lg p-2 rounded-lg overflow-auto focus:outline-none select-none"
        >
          <MenuItem>
            <button
              onClick={handleOpenFile}
              className="group flex w-full items-center gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-400/10"
            >
              <FolderOpenIcon className="size-4 " />
              {t("buttons.load")}
              <kbd className="ml-auto invisible font-sans text-xs text-neutral-500/80 group-data-[focus]:visible">
                ⌘O
              </kbd>
            </button>
          </MenuItem>
          <MenuItem>
            <button
              onClick={handleSave}
              className="group flex w-full items-center gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-400/10"
            >
              <ArrowDownTrayIcon className="size-4 " />
              {t("buttons.export")}
              <kbd className="ml-auto invisible font-sans text-xs text-neutral-500/80 group-data-[focus]:visible">
                ⌘S
              </kbd>
            </button>
          </MenuItem>
          <MenuItem>
            <button
              onClick={handleResetCanvas}
              className="group flex w-full items-center gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-400/10"
            >
              <TrashIcon className="size-4 " />
              {t("buttons.clearReset")}
            </button>
          </MenuItem>
          <MenuItem>
            <button
              onClick={handleDarkMode}
              className="group flex w-full items-center gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-400/10"
            >
              {theme === "dark" ? (
                <>
                  <SunIcon className="size-4 " /> {t("buttons.lightMode")}
                </>
              ) : (
                <>
                  {" "}
                  <MoonIcon className="size-4 " />
                  {t("buttons.darkMode")}
                </>
              )}
            </button>
          </MenuItem>
          <MenuItem>
            <LanguageList />
          </MenuItem>
        </MenuItems>
      </Transition>
    </Menu>
  )
}

export default MainMenu

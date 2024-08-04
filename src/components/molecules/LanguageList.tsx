import { Select } from "@headlessui/react"
import { ChevronDownIcon } from "@heroicons/react/20/solid"
import clsx from "clsx"
import { useContext } from "react"
import {
  LanguageContext,
  languages,
  useSetLanguageFromCode,
  useTranslation,
} from "../../hooks/useTranslation"
import React from "react"

export const LanguageList = React.forwardRef(() => {
  const setLanguageFromCode = useSetLanguageFromCode()
  const currentLanguageContext = useContext(LanguageContext)

  if (!currentLanguageContext) {
    throw new Error(
      "LanguageList has to be used within <LanguageContext.Provider>",
    )
  }

  const [language] = currentLanguageContext

  const t = useTranslation()

  return (
    <div className="relative focus:outline-none focus-visible:outline-none">
      <Select
        className={clsx(
          "mt-2 block w-full appearance-none rounded-lg border dark:border-none bg-white/5 py-1.5 px-3 text-sm/6 dark:text-neutral-400 text-neutral-700",
          "focus:outline-none data-[focus]:outline-2 data-[focus]:-outline-offset-2 data-[focus]:outline-white/25",
          // Make the text of each option black on Windows
          "*:text-black",
        )}
        onChange={({ target }) => setLanguageFromCode(target.value)}
        value={language.label}
        aria-label={t("buttons.selectLanguage")}
      >
        <option key={language.code} value={language.code}>
          {language.label}
        </option>
        {languages.map(lang => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </Select>
      <ChevronDownIcon
        className="group absolute top-2.5 right-2.5 size-4 fill-dark/60 dark:fill-white/60"
        aria-hidden="true"
      />
    </div>
  )
})

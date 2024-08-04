import {
  type FC,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useState,
} from "react"
import fallbackLangData from "../locales/en.json"
import french from "../locales/fr-FR.json"
import deutsch from "../locales/de-DE.json"

export interface Language {
  code: string
  label: string
}

export const defaultLanguage = { code: "en", label: "English" }

const allLanguages: Language[] = [
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
].concat([defaultLanguage])

export const languages: Language[] = allLanguages.sort((left, right) =>
  left.label > right.label ? 1 : -1,
)

export const getLanguageFromCode = (code: string) => {
  const result = allLanguages.find(element => element.code === code)
  if (!result) {
    throw new Error("unable to find language from code")
  }
  return result
}

export const getLanguageData = (languageCode: string) => {
  let currentLangData = {}
  //document.documentElement.lang = currentLang.code
  if (languageCode === "fr-FR") {
    currentLangData = french
  } else if (languageCode === "de-DE") {
    currentLangData = deutsch
  } else {
    currentLangData = fallbackLangData
  }
  return currentLangData
}

const findPartsForData = (jsonData: any, jsonKeys: string[]) => {
  for (const jsonKey of jsonKeys) {
    if (jsonData[jsonKey] === undefined) {
      return undefined
    }
    jsonData = jsonData[jsonKey]
  }
  if (typeof jsonData !== "string") {
    return undefined
  }
  return jsonData
}

type CurrentLanguageContextType = [
  language: Language,
  setLanguage: React.Dispatch<React.SetStateAction<Language>>,
]

export const LanguageContext = createContext<CurrentLanguageContextType | null>(
  null,
)

export const LanguageContextProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  //const [language, setLanguage] = useState(defaultLanguage)
  const languageAndSetLanguage = useState(defaultLanguage)

  return (
    <LanguageContext.Provider value={languageAndSetLanguage}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useSetLanguageFromCode = () => {
  const currentLanguageContext = useContext(LanguageContext)

  if (!currentLanguageContext) {
    throw new Error(
      "useSetLangCode has to be used within <LanguageContext.Provider>",
    )
  }

  const [, setLanguage] = currentLanguageContext

  const setLanguageFromCode = useCallback(
    (code: string) => {
      const newLanguage = getLanguageFromCode(code)
      setLanguage(newLanguage)
    },
    [setLanguage],
  )

  return setLanguageFromCode
}

export const useTranslation = () => {
  const currentLanguageContext = useContext(LanguageContext)
  if (!currentLanguageContext) {
    throw new Error(
      "useTranslation has to be used within <LanguageContext.Provider>",
    )
  }

  const [language] = currentLanguageContext
  const currentLangData = getLanguageData(language.code)
  const t = useCallback(
    (path: string) => {
      const parts = path.split(".")
      let translation =
        findPartsForData(currentLangData, parts) ??
        findPartsForData(fallbackLangData, parts)
      if (translation === undefined) {
        throw new Error(`Can't find translation for ${path}`)
      }
      return translation
    },
    [currentLangData],
  )

  return t
}

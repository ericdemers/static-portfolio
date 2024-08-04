import { useLayoutEffect, useState } from "react"

export const useWindowSize = () => {
  const [windowSize, setWindowSize] = useState([0, 0])
  const updateWindowSize = () => {
    setWindowSize([window.innerWidth, window.innerHeight])
  }

  useLayoutEffect(() => {
    window.addEventListener("resize", updateWindowSize)
    window.addEventListener("orientationchange", updateWindowSize)
    updateWindowSize()
    return () => {
      window.removeEventListener("resize", updateWindowSize)
      window.removeEventListener("orientationchange", updateWindowSize)
    }
  }, [])

  return windowSize
}

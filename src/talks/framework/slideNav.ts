/**
 * Shared slide-navigation state for the presentation.
 *
 * Slides are static JSX rendered inside RevealPresentation, so they can't
 * easily know their own index or call the router. This module lets a slide
 * (via WorkbenchLink) launch an external page that can return to the EXACT
 * slide it came from: RevealPresentation keeps `currentSlideIndex` updated,
 * and the link reads it at click time to build a ?slide=N return URL.
 */

let currentSlideIndex = 0

/** Called by RevealPresentation on every slide change. */
export function setCurrentSlideIndex(i: number): void {
  currentSlideIndex = i
}

/** Read by a slide's WorkbenchLink at click time. */
export function getCurrentSlideIndex(): number {
  return currentSlideIndex
}

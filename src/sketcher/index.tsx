// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
// Lazy entry for the imported Sketcher editor. Initializes i18n as a side
// effect (so the editor's translated UI works) and re-exports the page. Loaded
// only on the /sketcher route, so i18n + the editor engine stay out of the
// home/talk bundles.
import './i18n'
export { default } from './pages/Sketcher'

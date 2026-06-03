// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
import type { Curve } from './curve'

export interface CanvasConfig {
  // Mode
  mode?: 'sketcher' | 'demo' | 'learn'

  // Initial state
  initialCurves?: Curve[]

  // UI visibility overrides
  showHamburger?: boolean // default: true in sketcher
  showPencilTool?: boolean // default: true in sketcher
  showRightMenu?: boolean // default: auto (when selected)
  showBottomBar?: boolean // default: auto (when curves exist)
  showBottomPanel?: boolean // default: auto (when toggled)

  // Behavior overrides
  allowDrawing?: boolean // default: true
  allowSelection?: boolean // default: true
  alwaysSelected?: boolean // default: false (for demos)
  showControlPolygon?: boolean // default: only when selected
  hidePolygonOnDeselect?: boolean // default: false — when true, the control
  // polygon follows selection (clicking empty space hides it instead of
  // leaving it shown/greyed). Overrides showControlPolygon's always-on.

  // Locked features (for Learn pages)
  lockedDegree?: number // prevent degree changes
  lockedCurveCount?: number // prevent adding/removing curves
}

// Preset configurations for different modes
export const SKETCHER_CONFIG: CanvasConfig = {
  mode: 'sketcher',
  showHamburger: true,
  showPencilTool: true,
  allowDrawing: true,
  allowSelection: true,
}

export const DEMO_CONFIG: CanvasConfig = {
  mode: 'demo',
  showHamburger: false,
  showPencilTool: false,
  showRightMenu: true,
  showBottomBar: false,
  allowDrawing: false,
  allowSelection: true,
  alwaysSelected: true,
  showControlPolygon: true,
}

export const LEARN_CONFIG: CanvasConfig = {
  mode: 'learn',
  showHamburger: false,
  showPencilTool: false,
  showRightMenu: true,
  showBottomBar: true,
  allowDrawing: true,
  allowSelection: true,
  showControlPolygon: true,
}

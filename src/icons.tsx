/*
function IconShellSolid(props) {
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props} />
}

function IconShellOutline(props) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" {...props} />
}

// Example usage:

function MyIcon() {
  return (
    <IconShellOutline className="text-blue-500">
      <circle cx="12" cy="12" r="10" />
    </IconShellOutline>
  )
}
*/

type Opts = {
  width?: number
  height?: number
} & React.SVGProps<SVGSVGElement>

export const createIcon = (d: React.ReactNode, opts: Opts) => {
  const {
    width = 512,
    height = width,
    style,
    ...rest
  } = typeof opts === "number" ? ({ width: opts } as Opts) : opts
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
      style={style}
      {...rest}
    >
      {d}
    </svg>
  )
}

const tablerIconProps: Opts = {
  width: 24,
  height: 24,
  fill: "none",
  strokeWidth: 2,
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const

const modifiedTablerIconProps: Opts = {
  width: 20,
  height: 20,
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const

export const HamburgerMenuIcon = createIcon(
  <g strokeWidth="1.5">
    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
    <line x1="4" y1="6" x2="20" y2="6"></line>
    <line x1="4" y1="12" x2="20" y2="12"></line>
    <line x1="4" y1="18" x2="20" y2="18"></line>
  </g>,
  tablerIconProps,
)

// tabler-icon: folder
export const LoadIcon = createIcon(
  <path
    d="m9.257 6.351.183.183H15.819c.34 0 .727.182 1.051.506.323.323.505.708.505 1.05v5.819c0 .316-.183.7-.52 1.035-.337.338-.723.522-1.037.522H4.182c-.352 0-.74-.181-1.058-.5-.318-.318-.499-.705-.499-1.057V5.182c0-.351.181-.736.5-1.054.32-.321.71-.503 1.057-.503H6.53l2.726 2.726Z"
    strokeWidth="1.25"
  />,
  modifiedTablerIconProps,
)

export const ExportIcon = createIcon(
  <path
    strokeWidth="1.25"
    d="M3.333 14.167v1.666c0 .92.747 1.667 1.667 1.667h10c.92 0 1.667-.746 1.667-1.667v-1.666M5.833 9.167 10 13.333l4.167-4.166M10 3.333v10"
  />,
  modifiedTablerIconProps,
)

export const TrashIcon = createIcon(
  <path
    strokeWidth="1.25"
    d="M3.333 5.833h13.334M8.333 9.167v5M11.667 9.167v5M4.167 5.833l.833 10c0 .92.746 1.667 1.667 1.667h6.666c.92 0 1.667-.746 1.667-1.667l.833-10M7.5 5.833v-2.5c0-.46.373-.833.833-.833h3.334c.46 0 .833.373.833.833v2.5"
  />,
  modifiedTablerIconProps,
)

export const MoonIcon = createIcon(
  <path
    clipRule="evenodd"
    d="M10 2.5h.328a6.25 6.25 0 0 0 6.6 10.372A7.5 7.5 0 1 1 10 2.493V2.5Z"
    stroke="currentColor"
  />,
  modifiedTablerIconProps,
)

export const SunIcon = createIcon(
  <g
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM10 4.167V2.5M14.167 5.833l1.166-1.166M15.833 10H17.5M14.167 14.167l1.166 1.166M10 15.833V17.5M5.833 14.167l-1.166 1.166M5 10H3.333M5.833 5.833 4.667 4.667" />
  </g>,
  modifiedTablerIconProps,
)

export const TriangleIcon = createIcon(
  <g strokeWidth="1.5">
    <path d="M 287 197 L159 69 c -4-3-8-5-13-5 s -9 2-13 5 L 5 197 c -3 4-5 8-5 13 s 2 9 5 13 c 4 4 8 5 13 5 h 256 c 5 0 9-1 13-5 s 5-8 5-13-1-9-5-13z" />
  </g>,
  tablerIconProps,
)

export const FreeDrawIcon = createIcon(
  <g>
    <path
      d="M 2 18 C 6 6.25, 8.5 9.25, 11.5 12 S 17 12, 19 5"
      strokeWidth="1.5"
    />
  </g>,
  modifiedTablerIconProps,
)

export const LineIcon = createIcon(
  <g>
    <path d="M 0 17 L 20 6" strokeWidth="1.5" />
  </g>,
  modifiedTablerIconProps,
)

export const CircleArcIcon = createIcon(
  <g>
    <path d="M 2.5 17.5 A 9 9 0 0 1 17.5 8 " strokeWidth="1.5" />
  </g>,
  modifiedTablerIconProps,
)

export const SimplifyIcon = createIcon(
  <g>
    <path
      d="
      M 1 3 C 1 4 3.5 7.25, 5.5 2 S 9 10 12 5 S 15 8, 18, 4
      M 1 11.5 C 6 8.25, 8.5 10.25, 11.5 12 S 17 12, 18 11.5
      M 1 18 L 18 18
      "
      strokeWidth="1.5"
    />
  </g>,
  modifiedTablerIconProps,
)

export const InsertKnotIcon = createIcon(
  <g strokeLinecap="round">
    <path d="M 0 10 L 6 10" strokeWidth="1.2" />
    <path d="M 14 10 L 20 10" strokeWidth="1.2" />
    <path d="M 10 8 L 10 12.5" strokeWidth="4" />
  </g>,
  modifiedTablerIconProps,
)

export const DeleteKnotIcon = createIcon(
  <g strokeLinecap="round">
    <path d="M 0 10 L 6 10" strokeWidth="1.2" />
    <path d="M 14 10 L 20 10" strokeWidth="1.2" />
    <path d="M 10 8 L 10 12.5" strokeWidth="4" />
    <path d="M 6 6 L 14 14.5" strokeWidth="1.2" />
  </g>,
  modifiedTablerIconProps,
)

export const UpArrowIcon = createIcon(
  <g strokeLinecap="round">
    <path d="M 0 15 L 10 5" strokeWidth="1.5" />
    <path d="M 10 5 L 20 15" strokeWidth="1.5" />
  </g>,
  modifiedTablerIconProps,
)

export const DownArrowIcon = createIcon(
  <g strokeLinecap="round">
    <path d="M 0 8 L 10 18" strokeWidth="1.5" />
    <path d="M 10 18 L 20 8" strokeWidth="1.5" />
  </g>,
  modifiedTablerIconProps,
)

export const NonRationalBSpline = createIcon(
  <g>
    <path d="M 6 14 L 14 6" strokeWidth="0.7" />
    <circle cx="4" cy="16" r="1.6" fill="currentColor" strokeWidth="0" />
    <circle cx="4" cy="16" r="2.4" strokeWidth="0.3" />
    <circle cx="16" cy="4" r="1.6" fill="currentColor" strokeWidth="0" />
    <circle cx="16" cy="4" r="2.4" strokeWidth="0.3" />
  </g>,
  modifiedTablerIconProps,
)

export const RationalBSpline = createIcon(
  <g>
    <path d="M 6 14 L 14 6" strokeWidth="0.7" />
    <path d="M 8.5 8.5 L 11.5 11.5" strokeWidth="0.7" />
    <circle cx="4" cy="16" r="1.6" fill="currentColor" strokeWidth="0" />
    <circle cx="4" cy="16" r="2.4" strokeWidth="0.3" />
    <circle cx="16" cy="4" r="1.6" fill="currentColor" strokeWidth="0" />
    <circle cx="16" cy="4" r="2.4" strokeWidth="0.3" />
  </g>,
  modifiedTablerIconProps,
)

/**
 * A rx ry rotation large-arc-flag sweep-flag x y
 */
export const ComplexRationalBSpline = createIcon(
  <g>
    <path d="M 2.5 14 A 8 8 0 0 1 2 7 " strokeWidth="0.7" />
    <path d="M 6 2.5 A 8 8 0 0 1 14 2.5 " strokeWidth="0.7" />

    <circle cx="4" cy="16" r="1.6" fill="currentColor" strokeWidth="0" />
    <circle cx="4" cy="16" r="2.4" strokeWidth="0.3" />
    <circle cx="17" cy="4" r="1.6" fill="currentColor" strokeWidth="0" />
    <circle cx="17" cy="4" r="2.4" strokeWidth="0.3" />
    <circle cx="3.8" cy="4.2" r="1.6" fill="currentColor" strokeWidth="0" />
    <circle cx="3.8" cy="4.2" r="2.4" strokeWidth="0.3" />
  </g>,
  modifiedTablerIconProps,
)

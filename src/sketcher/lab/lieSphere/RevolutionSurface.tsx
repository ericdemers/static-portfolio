// @ts-nocheck — ported from ../sketcher Lie Sphere lab (engine intact)
import { useMemo } from 'react'
import * as THREE from 'three'
import {
  type Mat6,
  type Vec3,
  applyMat6,
  identity6,
  liftPointSphere,
  liftTangentPlane,
  readbackPoint,
} from './lieTransform'

export interface MeridianSample {
  /** Distance from the axis (must be >= 0). */
  r: number
  /** Position along the axis. */
  z: number
  /** Planar unit normal (radial, axial) — the analytic PH normal, shared with materialize. */
  nr: number
  nz: number
}

interface Props {
  /** Sampled meridian curve, ordered by parameter. */
  meridian: MeridianSample[]
  /** Number of revolution segments around the axis. */
  uSegments?: number
  /** Surface color. */
  color?: string
  /** Opacity (0..1). */
  opacity?: number
  /** Optional ridge ring t-values (each value is the meridian-sample index, may be fractional). */
  ridgeIndices?: number[]
  /** Lie sphere transform (element of O(4,2)) applied to every contact element. */
  transform?: Mat6
}

/** Push a surface point + normal through the Lie transform; fall back to p at infinity. */
function transformVertex(M: Mat6, p: Vec3, N: Vec3): Vec3 {
  const q = readbackPoint(applyMat6(M, liftPointSphere(p)), applyMat6(M, liftTangentPlane(p, N)))
  return q ?? p
}

/**
 * Renders the (Lie-transformed) surface swept from the (r, z) meridian. Each
 * (t, θ) grid vertex is lifted to a contact element, transformed by `transform`,
 * and read back to a point (Picture 1 — see DESIGN.md). With the identity it is
 * the plain surface of revolution; a non-axial transform breaks the symmetry, so
 * we keep the full grid and recompute normals from the deformed mesh. Ridge rings
 * are transformed the same way and stay ridges (Lie preserves curvature extrema).
 */
export default function RevolutionSurface({
  meridian,
  uSegments = 96,
  color = '#3b82f6',
  opacity = 0.85,
  ridgeIndices = [],
  transform = identity6(),
}: Props) {
  const surfaceGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const tCount = meridian.length
    if (tCount < 2) return geo

    const positions = new Float32Array(tCount * uSegments * 3)
    const indices: number[] = []

    for (let i = 0; i < tCount; i++) {
      const { r, z, nr, nz } = meridian[i]

      for (let j = 0; j < uSegments; j++) {
        const u = (j / uSegments) * Math.PI * 2
        const cosU = Math.cos(u)
        const sinU = Math.sin(u)
        const p: Vec3 = [r * cosU, r * sinU, z]
        const N: Vec3 = [nr * cosU, nr * sinU, nz]
        const q = transformVertex(transform, p, N)
        const idx = (i * uSegments + j) * 3
        positions[idx + 0] = q[0]
        positions[idx + 1] = q[1]
        positions[idx + 2] = q[2]
      }
    }

    for (let i = 0; i < tCount - 1; i++) {
      for (let j = 0; j < uSegments; j++) {
        const j1 = (j + 1) % uSegments
        const a = i * uSegments + j
        const b = i * uSegments + j1
        const c = (i + 1) * uSegments + j1
        const d = (i + 1) * uSegments + j
        indices.push(a, b, c, a, c, d)
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [meridian, uSegments, transform])

  // Ridge rings as TUBES (not GL <line>: `linewidth` is ignored by WebGL, so
  // lines render 1px and vanish against the surface). A small-radius tube along
  // each ring gives a real, always-visible 3D ring. Tube radius scales with the
  // surface extent so it reads at any zoom; the ring is pushed slightly along
  // the surface normal to avoid z-fighting.
  const ridgeTubes = useMemo(() => {
    // Characteristic size of the (transformed) surface → tube radius.
    let maxR = 0
    for (const m of meridian) maxR = Math.max(maxR, Math.abs(m.r), Math.abs(m.z))
    const tubeR = Math.max(maxR * 0.012, 0.004)

    return ridgeIndices.map((tIndex, k) => {
      const i0 = Math.max(0, Math.min(meridian.length - 1, Math.floor(tIndex)))
      const i1 = Math.max(0, Math.min(meridian.length - 1, Math.ceil(tIndex)))
      const frac = tIndex - i0
      const r = meridian[i0].r * (1 - frac) + meridian[i1].r * frac
      const z = meridian[i0].z * (1 - frac) + meridian[i1].z * frac
      let nr = meridian[i0].nr * (1 - frac) + meridian[i1].nr * frac
      let nz = meridian[i0].nz * (1 - frac) + meridian[i1].nz * frac
      const nLen = Math.hypot(nr, nz) || 1
      nr /= nLen
      nz /= nLen

      const pts: THREE.Vector3[] = []
      for (let j = 0; j <= uSegments; j++) {
        const u = (j / uSegments) * Math.PI * 2
        const cosU = Math.cos(u)
        const sinU = Math.sin(u)
        // Nudge the ring slightly off the surface along the normal so the tube
        // sits proud of the mesh (no z-fighting).
        const off = tubeR * 0.5
        const p: Vec3 = [(r + nr * off) * cosU, (r + nr * off) * sinU, z + nz * off]
        const N: Vec3 = [nr * cosU, nr * sinU, nz]
        const q = transformVertex(transform, p, N)
        pts.push(new THREE.Vector3(q[0], q[1], q[2]))
      }
      // Closed Catmull-Rom through the transformed ring → smooth tube.
      const curve = new THREE.CatmullRomCurve3(pts, true)
      const geo = new THREE.TubeGeometry(curve, uSegments, tubeR, 8, true)
      return { geo, key: `ridge-${k}` }
    })
  }, [ridgeIndices, meridian, uSegments, transform])

  return (
    <group>
      <mesh geometry={surfaceGeometry}>
        <meshStandardMaterial
          color={color}
          opacity={opacity}
          transparent={opacity < 1}
          side={THREE.DoubleSide}
          roughness={0.4}
          metalness={0.05}
        />
      </mesh>
      {ridgeTubes.map(({ geo, key }) => (
        <mesh key={key} geometry={geo} renderOrder={1}>
          {/* Emissive so the ridge reads even in shadow; depthTest off-ish via
              a bright unlit-ish material. */}
          <meshStandardMaterial
            color="#facc15"
            emissive="#f59e0b"
            emissiveIntensity={0.6}
            roughness={0.5}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  )
}

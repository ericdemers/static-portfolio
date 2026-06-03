// @ts-nocheck — ported from ../sketcher Lie Sphere lab (engine intact)
import { useMemo } from 'react'
import * as THREE from 'three'
import { type SurfaceNurbs, patchControlPoints } from './materialize'

/** Draws the NURBS control net (control points + net polylines) of a materialized surface. */
export default function ControlNet({
  nurbs,
  color = '#ef4444',
}: {
  nurbs: SurfaceNurbs
  color?: string
}) {
  const { lineGeo, pointGeo } = useMemo(() => {
    const segs: number[] = []
    const pts: number[] = []
    for (const patch of nurbs.patches) {
      const cp = patchControlPoints(patch)
      const ni = cp.length
      const nj = cp[0].length
      for (let i = 0; i < ni; i++) {
        for (let j = 0; j < nj; j++) {
          pts.push(cp[i][j][0], cp[i][j][1], cp[i][j][2])
          if (i + 1 < ni) segs.push(...cp[i][j], ...cp[i + 1][j])
          if (j + 1 < nj) segs.push(...cp[i][j], ...cp[i][j + 1])
        }
      }
    }
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3))
    const pointGeo = new THREE.BufferGeometry()
    pointGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return { lineGeo, pointGeo }
  }, [nurbs])

  return (
    <group>
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial color={color} transparent opacity={0.8} />
      </lineSegments>
      <points geometry={pointGeo}>
        <pointsMaterial color={color} size={0.045} sizeAttenuation />
      </points>
    </group>
  )
}

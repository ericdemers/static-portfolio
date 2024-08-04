
//import { VectorInterface } from "./VectorInterface"

/**
 * A three dimensional vector
 */

export class Vector3d  {
 
    constructor(public x = 0, public y = 0, public z = 0) {
    }

    negative()  {
        return new Vector3d(-this.x, -this.y, -this.z)
    }

    add(v: Vector3d) {
        return new Vector3d(this.x + v.x, this.y + v.y, this.z + v.z)
    }

    multiply(value: number) {
        return new Vector3d(this.x * value, this.y * value, this.z * value)
    }

    subtract(v: Vector3d) {
        return new Vector3d(this.x - v.x, this.y - v.y, this.z - v.z)
    }

    
    normalize() {
        let norm = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z)
        let x = this.x / norm
        let y = this.y / norm
        let z = this.z / norm
        return new Vector3d(x, y, z)
    }

    dot(v: Vector3d) {
        return this.x * v.x + this.y * v.y + this.z * v.z
    }

    distance(v: Vector3d) {
        return Math.sqrt(Math.pow(this.x - v.x, 2) + Math.pow(this.y - v.y, 2) + Math.pow(this.z - v.z, 2))
    }

    norm() {
        return Math.sqrt(Math.pow(this.x, 2) + Math.pow(this.y, 2) + Math.pow(this.z, 2))
    }

    clone() {
        return new Vector3d(this.x, this.y, this.z)
    }

    crossPoduct(v: Vector3d) {
       return new Vector3d(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x)
   }

   axisAngleRotation(axis: Vector3d, angle: number) {
       //https://en.wikipedia.org/wiki/Rodrigues%27_rotation_formula
       const k = axis.normalize()
       const firstTerm = this.multiply(Math.cos(angle))
       const secondTerm = k.crossPoduct(this).multiply(Math.sin(angle))
       const thirdTerm = k.multiply(k.dot(this)).multiply(1 - Math.cos(angle))
       return firstTerm.add(secondTerm).add(thirdTerm)
   }

}

/**
* @param p0 point
* @param p1 first point of the line
* @param p2 second point of the line
*/
export function pointLineDistance(p0: Vector3d, p1: Vector3d, p2: Vector3d) {
   // https://mathworld.wolfram.com/Point-LineDistance3-Dimensional.html
   return ((p0.subtract(p1)).crossPoduct(p0.subtract(p2))).norm() / p2.subtract(p1).norm()
}


export function linePlaneIntersection(lineP1: Vector3d, lineP2: Vector3d, lookAtOrigin: Vector3d, cameraPosition: Vector3d, objectCenter: Vector3d) {
   //https://en.wikipedia.org/wiki/Line–plane_intersection
   const l = lineP2.subtract(lineP1)
   const n = lookAtOrigin.subtract(cameraPosition)
   const nn = n.normalize()
   const a = nn.dot(objectCenter.subtract(cameraPosition))
   const p0 = nn.multiply(a).add(cameraPosition)
   const d = (p0.subtract(lineP1)).dot(n) / (l.dot(n))
   return lineP1.add(l.multiply(d))
}



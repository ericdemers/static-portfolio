import { describe, it } from 'vitest'
import { fitPHSplineToBSpline } from './phSplineFit'
import { decomposeToBernstein, integrateBD, recomposeBD } from './algebra'
import { createBSpline } from '../utils/bspline/utilities'
function wavy(){const p=[];for(let i=0;i<=12;i++)p.push({x:i*25,y:50*Math.sin(i/12*2*Math.PI)});return p}
describe('dbg',()=>{it('recompose',()=>{
  const bs:any=createBSpline(wavy(),3)
  const ph=fitPHSplineToBSpline(bs.controlPoints,bs.knots,{generatorDegree:2})!
  const m:any=ph.metadata
  const u=m.uControlPoints,v=m.vControlPoints,K=m.uvKnots
  const uBD=decomposeToBernstein({knots:K,controlPoints:u})
  const vBD=decomposeToBernstein({knots:K,controlPoints:v})
  const xPrime=uBD.multiply(uBD).subtract(vBD.multiply(vBD))
  const yPrime=uBD.multiply(vBD).multiplyByScalar(2)
  const xBD=integrateBD(xPrime,m.origin.x), yBD=integrateBD(yPrime,m.origin.y)
  const xs=recomposeBD(xBD,2), ys=recomposeBD(yBD,2)
  console.log('xCP',xs.controlPoints.length,'yCP',ys.controlPoints.length)
  // count multiplicity per interior knot
  function mult(knots:number[]){const m:Record<string,number>={};knots.forEach(k=>{const s=k.toFixed(4);m[s]=(m[s]||0)+1});return m}
  console.log('xKnotMult',JSON.stringify(mult(xs.knots)))
  console.log('yKnotMult',JSON.stringify(mult(ys.knots)))
})})

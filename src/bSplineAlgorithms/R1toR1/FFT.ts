/*
basic complex number arithmetic from 
http://rosettacode.org/wiki/Fast_Fourier_transform#Scala
*/

export class Complex {
    constructor(public re: number, public im: number = 0) {
    }
  
    add(other: Complex, dst: Complex) {
        dst.re = this.re + other.re
        dst.im = this.im + other.im
        return dst
    }
  
    sub(other: Complex, dst: Complex) {
        dst.re = this.re - other.re
        dst.im = this.im - other.im
        return dst
    }
  
    mul(other: Complex, dst: Complex) {
        //cache re in case dst === this
        const r = this.re * other.re - this.im * other.im
        dst.im = this.re * other.im + this.im * other.re
        dst.re = r
        return dst
    }
  
    cexp(dst: Complex) {
        const er = Math.exp(this.re)
        dst.re = er * Math.cos(this.im)
        dst.im = er * Math.sin(this.im)
        return dst
    }
  }
  
  
  
  /*
  complex fast fourier transform and inverse from
  http://rosettacode.org/wiki/Fast_Fourier_transform#C.2B.2B
  */
  export function icfft(amplitudes: Complex[])
  {
    const N = amplitudes.length
    const iN = 1 / N
    
    //conjugate if imaginary part is not 0
    for(let i = 0 ; i < N; ++i)
      if(amplitudes[i] instanceof Complex)
        amplitudes[i].im = -amplitudes[i].im;
    
    //apply fourier transform
    amplitudes = cfft(amplitudes)
    
    for(let i = 0 ; i < N; ++i)
    {
      //conjugate again
      amplitudes[i].im = -amplitudes[i].im
      //scale
      amplitudes[i].re *= iN
      amplitudes[i].im *= iN
    }
    return amplitudes
  }
  
  export function cfft(amplitudes: Complex[]) {
    let N = amplitudes.length
    if( N <= 1 )
      return amplitudes
    let hN = N / 2
    let even: Complex[] = []
    let odd: Complex[] = []
    even.length = hN
    odd.length = hN
    for(let i = 0; i < hN; ++i) {
      even[i] = amplitudes[i * 2]
      odd[i] = amplitudes[i * 2 + 1]
    }
    even = cfft(even)
    odd = cfft(odd)
    
    const a = -2 * Math.PI
    for(let k = 0; k < hN; ++k) {
      let p = k/N
      let t = new Complex(0, a * p)
      t.cexp(t).mul(odd[k], t)
      amplitudes[k] = even[k].add(t, odd[k])
      amplitudes[k + hN] = even[k].sub(t, even[k])
    }
    return amplitudes
  }
  
  
  export function fft(amplitudes: number[])
  {
    let complexAmplitudes: Complex[] = []
  for(let amplitude of amplitudes) {
        complexAmplitudes.push(new Complex(amplitude, 0))
    }
    return cfft(complexAmplitudes)
  }
  
  export function ifft(amplitudes: Complex[])
  {
    let realAmplitudes: number[] = []
    let complexAmplitudes = icfft(amplitudes)
    for(let amplitude of complexAmplitudes) {
        realAmplitudes.push(amplitude.re)
    }
    return realAmplitudes
  }
  
  
  
  
  //test code
  //console.log( cfft([1,1,1,1,0,0,0,0]) );
  //console.log( icfft(cfft([1,1,1,1,0,0,0,0])) );
  
  
  
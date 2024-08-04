export type lchColorType = {
    l: number,
    c: number,
    h: number
}

export const lchBaseColor: lchColorType  = {
    l: 40,
    c: 100,
    h: 0
}

function adjustHue(val: number) {
    if (val < 0) val += Math.ceil(-val / 360) * 360
    return val % 360
}

export function createColorPalette(numberOfColors: number, opacity: number | null = null , baseColor: lchColorType = lchBaseColor) {
    const palette = [...Array(numberOfColors).keys()].map((step) => {
        const h = adjustHue(baseColor.h + step * 360 / numberOfColors)
        if  (opacity) {
            return "lch(" + baseColor.l + " " + baseColor.c + " " + h + " / " + opacity + ")"
        } else {
            return "lch(" + baseColor.l + " " + baseColor.c + " " + h + ")"
        }
    })
    return palette
}

export function createColorPaletteRGB(numberOfColors: number, opacity: number | null = null , baseColor: lchColorType = lchBaseColor) {
    const palette = [...Array(numberOfColors).keys()].map((step) => {
        const h = adjustHue(baseColor.h + step * 360 / numberOfColors)
        const rgb = lch2rgb(baseColor.l, baseColor.c, h)
        if  (opacity) {
            return "rgba(" + rgb.r + " " + rgb.g + " " + rgb.b + " / " + opacity + ")"
        } else {
            return "rgb(" + rgb.r + " " + rgb.g + " " + rgb.b + ")"
        }
    })
    return palette
}

//https://stackoverflow.com/questions/63929820/converting-css-lch-to-rgb
//http://www.brucelindbloom.com/index.html?Math.html
//http://www.brucelindbloom.com/index.html?Math.html
export function lch2rgb(l: number, c: number, h: number) {

    const epsilon = 0.008856
    const kappa = 903.3

    const aa = Math.round(c * Math.cos(deg2rad(h)))
    const bb = Math.round(c * Math.sin(deg2rad(h)))

    // Reference white values for CIE 1964 10 Standard Observer
    const xw = 0.948110
    const yw = 1
    const zw = 1.07304

    // Compute intermediate values
    const fy = (l + 16) / 116
    const fx = fy + (aa / 500)
    const fz = fy - (bb / 200)

    // Compute XYZ values
    
    const x = xw * (( Math.pow(fx, 3) > 0.008856) ? Math.pow(fx, 3) : (fx - 16 / 116) / 7.787)
    const y = yw * (( Math.pow(fy, 3) > 0.008856) ? Math.pow(fy, 3) : (fy - 16 / 116) / 7.787)
    const z = zw * (( Math.pow(fz, 3) > 0.008856) ? Math.pow(fz, 3) : (fz - 16 / 116) / 7.787)
    

    /*
    const x = xw * (( Math.pow(fx, 3) > epsilon) ? Math.pow(fx, 3) : (116 * fx - 16) / kappa)
    const y = yw * (( l > kappa * epsilon) ? Math.pow((l + 16) / 116, 3 ) : l / kappa)
    const z = zw * (( Math.pow(fz, 3) > epsilon) ? Math.pow(fz, 3) : (116 * fz - 16) / kappa)
    */

    
    let r = x * 3.2406 - y * 1.5372 - z * 0.4986
    let g =  x * (-0.9689) + y * 1.8758 + z * 0.0415
    let b = x * 0.0557 - y * 0.2040 + z * 1.0570
    

    /*
    let r = x * 2.95 - y * 1.289 - z * 0.473
    let g = x * -1.085 + y * 1.99 + z * 0.0372
    let b = x * 0.0854 - y * 0.2694 + z * 1.0913
    */
    
    
    r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r
    g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g
    b = b > 0.0031308 ? 1.055 * Math.pow(b, 1 / 2.4) - 0.055 : 12.92 * b
    

    r = Math.round(Math.max(Math.min(r, 1), 0) * 255)
    g = Math.round(Math.max(Math.min(g, 1), 0) * 255)
    b = Math.round(Math.max(Math.min(b, 1), 0) * 255)
    return {r, g, b}
}

const deg2rad = (deg: number) => (deg * Math.PI) / 180.0
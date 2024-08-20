import { saveAs } from 'file-saver'

const SVG_NS = "http://www.w3.org/2000/svg"

export const exportToSvg = async (): Promise<SVGSVGElement> => {
    // initialize SVG root
    let svgRoot = document.createElementNS(SVG_NS, "svg")
    svgRoot.setAttribute('version', '1.1')
    svgRoot.setAttribute('xmlns', SVG_NS)
    svgRoot.setAttribute('viewBox', '0, 0, 300, 300')
    svgRoot.setAttribute('width', '300')
    svgRoot.setAttribute('height', '300')


    let newRect = document.createElementNS(SVG_NS, "rect")
    newRect.setAttribute("x", "75")
    newRect.setAttribute("y", "75")
    newRect.setAttribute("width", "150")
    newRect.setAttribute("height", "150")
    newRect.setAttribute("fill", "#5cceee")

    svgRoot.appendChild(newRect)

    return svgRoot
}

export const downloadRectangleSvg = async () => {
    const svgRoot = await exportToSvg()
    const s = svgRoot.outerHTML
    const blob = new Blob([s], { type: "image/svg+xml" })
    saveAs(blob, "image.svg" )
}


import saveAs from "file-saver"
import type { Curve } from "../sketchElements/curveTypes"

/*
export const testSave = () => {
    const blob = new Blob(["Hello, world!"], {type: "text/plain;charset=utf-8"})
    saveAs(blob, "hello world.txt")
}
    */

export const saveCurves = (curves: readonly Curve[]) => {
    const blob = new Blob([JSON.stringify(curves)], {type: 'application/json' })
    saveAs(blob, "curves.json")
}

/*
export function readSingleFile() {

    let fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.click()

    fileInput.addEventListener('change', () => {
        if (fileInput.files === null) return
        const file = fileInput.files[0]
        if (file) {
            const fileReader = new FileReader()
            fileReader.onload = () => {
                const fileContent = fileReader.result as string
                openCurves(fileContent)
            }
            fileReader.readAsText(file)
        }
    })
}

export const openCurves = (fileContent: string) => {
    const curves = JSON.parse(fileContent)
    console.log(curves)
}
    */
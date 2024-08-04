import "./App.css"
import { Routes, Route } from "react-router-dom"
import HomePage from "./pages/HomePage"
import SketcherPage from "./pages/SketcherPage"

const App = () => {
  return (
    <div>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sketcher" element={<SketcherPage />} />
      </Routes>
    </div>
  )
}

export default App

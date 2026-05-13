import CaseWorkspace from './components/CaseWorkspace'
import './App.css'

export default function App() {
  return (
    <div className="app">
      <header>
        <h1>Translation review</h1>
        <p className="sub">
          Run the API on port 8000, then create a case, upload a PDF, call process, and load by case id.
        </p>
      </header>
      <CaseWorkspace />
    </div>
  )
}

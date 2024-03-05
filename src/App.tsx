import { Link } from 'react-router-dom'

import './App.css'

export function App() {
  return (
    <div className="App">
      <header className="App-header">
        <ul>
          <li>
            <Link to="/v4-router">V4 router example</Link>
          </li>
          <li>
            <Link to="/smart-router">Smart router example</Link>
          </li>
        </ul>
      </header>
    </div>
  )
}

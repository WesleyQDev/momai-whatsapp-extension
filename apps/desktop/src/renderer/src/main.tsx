import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import OverlayView from './views/OverlayView'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/overlay" element={<OverlayView />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </HashRouter>
  </StrictMode>
)

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

// Aquí buscamos el div con id "root" que acabamos de crear
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
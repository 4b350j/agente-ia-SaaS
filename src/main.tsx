import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// --- 1. IMPORTAR SENTRY ---
import * as Sentry from "@sentry/react";

// --- 2. INICIALIZAR EL MONITOR ---
// 🔴 PEGA AQUÍ TU DSN DE FRONTEND (REACT)
Sentry.init({
  dsn: "https://3767fd295556b9c98e46a668826c7687@o4510614400532480.ingest.de.sentry.io/4510614449684560",

  integrations: [
    // Permite rastrear la navegación del usuario (qué páginas visita)
    Sentry.browserTracingIntegration(),
    // Permite grabar "video" de la sesión cuando hay un error
    Sentry.replayIntegration(),
  ],

  // --- CONFIGURACIÓN DE RENDIMIENTO ---
  // 1.0 = Captura el 100% de las transacciones (bueno para Beta)
  // En producción real con muchos usuarios, bájalo a 0.1
  tracesSampleRate: 1.0, 

  // --- CONFIGURACIÓN DE REPLAY (VIDEO) ---
  // Graba solo el 10% de las sesiones normales
  replaysSessionSampleRate: 0.1, 
  // ¡IMPORTANTE! Graba el 100% de las sesiones donde ocurra un ERROR
  replaysOnErrorSampleRate: 1.0, 
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

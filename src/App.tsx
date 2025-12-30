import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { createClient } from '@supabase/supabase-js'
import { jsPDF } from 'jspdf'
import './App.css'

// 👇👇👇 TUS DATOS REALES (NO LOS BORRES) 👇👇👇
const API_URL = "https://agente-ia-saas.onrender.com"
const SUPABASE_URL = "https://bvmwdavonhknysvfnybi.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2bXdkYXZvbmhrbnlzdmZueWJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4OTYyNDQsImV4cCI6MjA4MjQ3MjI0NH0.DJwhA13v9JoU_Oa7f3XZafxlSYlwBNcJdBb35ujNmpA"
// 👆👆👆 ----------------------------------- 👆👆👆

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// --- 🧠 CEREBROS DISPONIBLES (ROLES COMPLETOS) ---
const ROLES = [
  // --- ÁREA LEGAL ---
  { 
    id: 'lawyer_general', 
    name: 'Abogado General', 
    icon: '⚖️', 
    desc: 'Detecta riesgos legales y cláusulas abusivas.',
    prompt: 'Actúa como un abogado senior experto en derecho contractual. Analiza el documento buscando riesgos legales, ambigüedades y cláusulas abusivas. Cita textualmente las partes relevantes y sugiere cambios para proteger al usuario.' 
  },
  { 
    id: 'lawyer_labor', 
    name: 'Laboralista', 
    icon: '👷', 
    desc: 'Revisa contratos de trabajo y despidos.',
    prompt: 'Actúa como un abogado laboralista experto en defensa del trabajador. Analiza el documento buscando violaciones de los derechos laborales, cálculo incorrecto de finiquitos, cláusulas de no competencia abusivas o condiciones ilegales según el Estatuto de los Trabajadores.' 
  },
  { 
    id: 'lawyer_gdpr', 
    name: 'Experto en Datos (RGPD)', 
    icon: '🔐', 
    desc: 'Auditoría de Privacidad y Cookies.',
    prompt: 'Actúa como un consultor experto en Protección de Datos (RGPD/GDPR). Analiza este documento legal o política de privacidad y señala si cumple con la normativa europea de protección de datos, si el consentimiento es explícito y si falta información obligatoria.' 
  },

  // --- ÁREA FINANCIERA ---
  { 
    id: 'auditor', 
    name: 'Auditor Financiero', 
    icon: '💰', 
    desc: 'Busca incoherencias y fugas de dinero.',
    prompt: 'Actúa como un auditor financiero meticuloso (Big 4). Analiza el documento buscando incoherencias numéricas, gastos duplicados, falta de justificación en partidas presupuestarias y riesgos financieros operativos.' 
  },
  { 
    id: 'tax_advisor', 
    name: 'Asesor Fiscal', 
    icon: '📉', 
    desc: 'Optimización de impuestos y deducciones.',
    prompt: 'Actúa como un Asesor Fiscal experto. Analiza esta factura o balance y busca oportunidades de deducción fiscal, gastos no deducibles que podrían causar problemas con Hacienda, y errores en el cálculo del IVA o retenciones.' 
  },

  // --- UTILIDADES ---
  { 
    id: 'summarizer', 
    name: 'Resumidor Ejecutivo', 
    icon: '📝', 
    desc: 'Lo esencial en menos de 2 minutos.',
    prompt: 'Actúa como un asistente ejecutivo altamente eficiente. Tu objetivo es sintetizar la información para que se pueda leer rápidamente. Ignora la paja y destaca solo los puntos clave, fechas límite, importes económicos y obligaciones en una lista con viñetas.' 
  },
  { 
    id: 'translator', 
    name: 'Traductor Jurídico', 
    icon: '🌍', 
    desc: 'Traduce y explica términos complejos.',
    prompt: 'Actúa como un traductor jurado experto. Si el documento está en otro idioma, tradúcelo al español manteniendo la terminología legal precisa. Si ya está en español, "traduce" la jerga legal incomprensible a un lenguaje llano que cualquier persona pueda entender.' 
  },
]

// --- FUNCIÓN DE RECONEXIÓN (Resiliencia) ---
async function fetchWithRetry(url: string, options: any, retries = 3, backoff = 1000) {
  try {
    const res = await fetch(url, options)
    if (!res.ok) {
        if (res.status === 503 || res.status === 504) throw new Error("Server sleeping")
        return res
    }
    return res
  } catch (err) {
    if (retries > 0) {
      console.log(`Reintentando conexión... intentos restantes: ${retries}`)
      await new Promise(resolve => setTimeout(resolve, backoff))
      return fetchWithRetry(url, options, retries - 1, backoff * 2)
    }
    throw err
  }
}

export default function App() {
  const [session, setSession] = useState<any>(null)
  
  // Login
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  
  // App
  const [name, setName] = useState('')
  const [persona, setPersona] = useState('')
  const [chatStarted, setChatStarted] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const [inputMsg, setInputMsg] = useState('')
  const [loading, setLoading] = useState(false)
  
  // PDF Data
  const [pdfText, setPdfText] = useState('')
  const [pdfName, setPdfName] = useState('')
  const [uploading, setUploading] = useState(false)

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // --- CRÉDITOS EFÍMEROS (Se reinician al recargar F5) ---
  const [credits, setCredits] = useState(3)

  const useCredit = () => {
    if (credits > 0) {
      setCredits(prev => prev - 1)
      return true
    }
    return false
  }

  // --- GENERAR PDF ---
  const downloadReport = () => {
    const doc = new jsPDF()
    const margin = 15
    let y = 20

    // Cabecera
    doc.setFontSize(18)
    doc.setTextColor(37, 99, 235) // Azul Nexus
    doc.text(`Informe Nexus AI`, margin, y)
    y += 10
    
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(`Archivo: ${pdfName || 'Desconocido'}`, margin, y)
    y += 6
    doc.text(`Fecha: ${new Date().toLocaleString()}`, margin, y)
    y += 10
    
    doc.setDrawColor(200)
    doc.line(margin, y, 195, y) // Línea separadora
    y += 15

    // Contenido
    doc.setFontSize(11)
    doc.setTextColor(0)

    messages.forEach((msg) => {
        const role = msg.sender === 'user' ? 'TÚ:' : `${name.toUpperCase() || 'AGENTE'}:`
        
        // 1. Rol (Negrita)
        doc.setFont("helvetica", "bold")
        doc.text(role, margin, y)
        y += 6

        // 2. Mensaje (Normal + Limpieza MD)
        doc.setFont("helvetica", "normal")
        const cleanText = msg.text
          .replace(/\*\*/g, '')
          .replace(/#/g, '')
          .replace(/`/g, '')
        
        const splitText = doc.splitTextToSize(cleanText, 180)
        doc.text(splitText, margin, y)
        
        y += (splitText.length * 6) + 10 

        if (y > 270) {
            doc.addPage()
            y = 20
        }
    })

    doc.save('Informe_Nexus.pdf')
  }

  // --- EFECTOS ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) setMessages([])
    })
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => { window.removeEventListener('resize', handleResize); subscription.unsubscribe() }
  }, [])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, loading])

  // --- HANDLERS ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = authMode === 'login' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) alert("Error de acceso: " + error.message)
    else if (authMode === 'register') alert('¡Cuenta creada! Revisa tu correo o entra directamente.')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setChatStarted(false); setMessages([]); setPdfName(''); setPdfText('')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 🔒 CONTROL DE SESIÓN
    if (credits <= 0) {
        alert("🔒 Límite de sesión segura alcanzado.\n\nPor privacidad, Nexus AI requiere



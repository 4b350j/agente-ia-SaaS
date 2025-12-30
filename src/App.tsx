import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { createClient } from '@supabase/supabase-js'
import { jsPDF } from 'jspdf'
import './App.css'

// 👇👇👇 AHORA USAMOS VARIABLES DE ENTORNO (SEGURO) 👇👇👇
const API_URL = import.meta.env.VITE_API_URL
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY
// 👆👆👆 ----------------------------------------- 👆👆👆

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// --- ROLES (Usamos comillas invertidas para evitar errores de texto largo) ---
const ROLES = [
  { 
    id: 'lawyer_general', 
    name: 'Abogado General', 
    icon: '⚖️', 
    desc: 'Detecta riesgos legales y cláusulas abusivas.',
    prompt: `Actúa como un abogado senior experto en derecho contractual. Analiza el documento buscando riesgos legales, ambigüedades y cláusulas abusivas. Cita textualmente las partes relevantes y sugiere cambios para proteger al usuario.` 
  },
  { 
    id: 'lawyer_labor', 
    name: 'Laboralista', 
    icon: '👷', 
    desc: 'Revisa contratos de trabajo y despidos.',
    prompt: `Actúa como un abogado laboralista experto en defensa del trabajador. Analiza el documento buscando violaciones de los derechos laborales, cálculo incorrecto de finiquitos, cláusulas de no competencia abusivas o condiciones ilegales según el Estatuto de los Trabajadores.` 
  },
  { 
    id: 'lawyer_gdpr', 
    name: 'Experto en Datos (RGPD)', 
    icon: '🔐', 
    desc: 'Auditoría de Privacidad y Cookies.',
    prompt: `Actúa como un consultor experto en Protección de Datos (RGPD/GDPR). Analiza este documento legal o política de privacidad y señala si cumple con la normativa europea de protección de datos, si el consentimiento es explícito y si falta información obligatoria.` 
  },
  { 
    id: 'auditor', 
    name: 'Auditor Financiero', 
    icon: '💰', 
    desc: 'Busca incoherencias y fugas de dinero.',
    prompt: `Actúa como un auditor financiero meticuloso (Big 4). Analiza el documento buscando incoherencias numéricas, gastos duplicados, falta de justificación en partidas presupuestarias y riesgos financieros operativos.` 
  },
  { 
    id: 'tax_advisor', 
    name: 'Asesor Fiscal', 
    icon: '📉', 
    desc: 'Optimización de impuestos y deducciones.',
    prompt: `Actúa como un Asesor Fiscal experto. Analiza esta factura o balance y busca oportunidades de deducción fiscal, gastos no deducibles que podrían causar problemas con Hacienda, y errores en el cálculo del IVA o retenciones.` 
  },
  { 
    id: 'summarizer', 
    name: 'Resumidor Ejecutivo', 
    icon: '📝', 
    desc: 'Lo esencial en menos de 2 minutos.',
    prompt: `Actúa como un asistente ejecutivo altamente eficiente. Tu objetivo es sintetizar la información para que se pueda leer rápidamente. Ignora la paja y destaca solo los puntos clave, fechas límite, importes económicos y obligaciones en una lista con viñetas.` 
  },
  { 
    id: 'translator', 
    name: 'Traductor Jurídico', 
    icon: '🌍', 
    desc: 'Traduce y explica términos complejos.',
    prompt: `Actúa como un traductor jurado experto. Si el documento está en otro idioma, tradúcelo al español manteniendo la terminología legal precisa. Si ya está en español, traduce la jerga legal incomprensible a un lenguaje llano que cualquier persona pueda entender.` 
  },
]

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
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  
  const [name, setName] = useState('')
  const [persona, setPersona] = useState('')
  const [chatStarted, setChatStarted] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const [inputMsg, setInputMsg] = useState('')
  const [loading, setLoading] = useState(false)
  
  const [pdfText, setPdfText] = useState('')
  const [pdfName, setPdfName] = useState('')
  const [uploading, setUploading] = useState(false)

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const [credits, setCredits] = useState(3)

  const useCredit = () => {
    if (credits > 0) {
      setCredits(prev => prev - 1)
      return true
    }
    return false
  }

  const downloadReport = () => {
    const doc = new jsPDF()
    const margin = 15
    let y = 20

    doc.setFontSize(18)
    doc.setTextColor(37, 99, 235)
    doc.text(`Informe Nexus AI`, margin, y)
    y += 10
    
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(`Archivo: ${pdfName || 'Desconocido'}`, margin, y)
    y += 6
    doc.text(`Fecha: ${new Date().toLocaleString()}`, margin, y)
    y += 10
    
    doc.setDrawColor(200)
    doc.line(margin, y, 195, y)
    y += 15

    doc.setFontSize(11)
    doc.setTextColor(0)

    messages.forEach((msg) => {
        const role = msg.sender === 'user' ? 'TÚ:' : `${name.toUpperCase() || 'AGENTE'}:`
        
        doc.setFont("helvetica", "bold")
        doc.text(role, margin, y)
        y += 6

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

    if (credits <= 0) {
        // 👇 USO COMILLAS INVERTIDAS PARA EVITAR EL ERROR DE TEXTO LAGO 👇
        alert(`🔒 Límite de sesión segura alcanzado.

Por privacidad, Nexus AI requiere reiniciar la sesión tras 3 análisis.

Por favor, recarga la página (F5) para limpiar la memoria y comenzar de nuevo.`)
        e.target.value = ''
        return
    }

    if (file.size > 5 * 1024 * 1024) {
        alert("⚠️ El archivo es demasiado grande. Máximo 5MB.")
        return
    }

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetchWithRetry(`${API_URL}/api/upload`, { method: 'POST', body: formData })
      if (!res.ok) {
          const errData = await res.json()
          throw new Error(errData.detail || "Error al procesar PDF")
      }
      
      const data = await res.json()
      if (data.warning) alert("Aviso: " + data.warning)
      
      setPdfText(data.extracted_text)
      setPdfName(data.filename)
      
      useCredit()

      setMessages(prev => [...prev, { sender: 'agent', text: `✅ **Documento recibido:** ${data.filename}\n\n💎 Crédito utilizado. Te quedan **${credits - 1}**.\n\nHe analizado el contenido. ¿Qué quieres saber?` }])
      
    } catch (err: any) {
      alert('❌ Error: ' + err.message)
      console.error(err)
      setPdfName('')
    }
    setUploading(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetchWithRetry(`${API_URL}/api/agents`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, persona })
      })
      const data = await res.json()
      setMessages([{ sender: 'agent', text: data.welcome_msg }])
      setChatStarted(true)
    } catch (err: any) { alert('No se pudo conectar con el servidor.') }
    setLoading(false)
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputMsg.trim()) return
    const userMsg = inputMsg
    
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }])
    setInputMsg('')
    setLoading(true)

    try {
      const res = await fetchWithRetry(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, persona, history: messages, message: userMsg, context: pdfText })
      })
      const data = await res.json()
      setMessages(prev => [...prev, { sender: 'agent', text: data.response }])
    } catch (err) { 
        setMessages(prev => [...prev, { sender: 'agent', text: "⚠️ Error de conexión." }])
    }
    setLoading(false)
  }

  const colors = { bg: '#f3f4f6', cardBg: '#ffffff', textMain: '#111827', primary: '#2563eb', border: '#e5e7eb', userBubble: '#2563eb', agentBubble: '#f3f4f6' }
  const containerStyle: React.CSSProperties = { minHeight: '100vh', background: colors.bg, color: colors.textMain, fontFamily: '"Inter", sans-serif', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }
  const cardStyle: React.CSSProperties = { width: isMobile ? '100%' : '1000px', height: isMobile ? '90vh' : '85vh', background: colors.cardBg, borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: isMobile ? 'column' : 'row', border: `1px solid ${colors.border}` }
  const inputStyle: React.CSSProperties = { width: '100%', background: '#f9fafb', border: `1px solid ${colors.border}`, padding: '12px', borderRadius: '6px', outline: 'none' }
  const buttonStyle: React.CSSProperties = { padding: '12px', background: colors.primary, color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', width: '100%' }

  const LoadingDots = () => (
    <div style={{ display: 'flex', gap: '4px', padding: '10px 16px', background: colors.agentBubble, borderRadius: '12px', width: 'fit-content', alignSelf: 'flex-start' }}>
       <div className="dot-animate dot-1" style={{ width: '8px', height: '8px', background: '#9ca3af', borderRadius: '50%' }}></div>
       <div className="dot-animate dot-2" style={{ width: '8px', height: '8px', background: '#9ca3af', borderRadius: '50%' }}></div>
       <div className="dot-animate dot-3" style={{ width: '8px', height: '8px', background: '#9ca3af', borderRadius: '50%' }}></div>
    </div>
  )

  if (!session) {
    return (
      <div style={containerStyle}>
        <div style={{...cardStyle, width: '400px', height: 'auto', flexDirection: 'column', padding: '40px'}}>
          <h2 style={{color: colors.primary, textAlign: 'center', marginBottom: '20px'}}>🔐 Nexus AI Login</h2>
          <form onSubmit={handleAuth} style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
            <input type="email" placeholder="Correo electrónico" style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} required />
            <input type="password" placeholder="Contraseña" style={inputStyle} value={password} onChange={e => setPassword(e.target.value)} required />
            <button disabled={loading} style={buttonStyle}>{loading ? 'Procesando...' : (authMode === 'login' ? 'Entrar' : 'Registrarse')}</button>
          </form>
          <p style={{textAlign: 'center', marginTop: '15px', fontSize: '0.9rem', cursor: 'pointer', color: '#6b7280'}} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            {authMode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {showSidebar && (
          <div style={{ width: isMobile ? '100%' : '350px', padding: '32px', borderRight: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{marginBottom:'20px'}}>
               <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: colors.primary }}>Nexus AI 🛡️</h2>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px' }}>
                 <p style={{fontSize: '0.8rem', color: '#6b7280'}}>{session.user.email}</p>
                 <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: credits > 0 ? '#16a34a' : '#dc2626', background: credits > 0 ? '#dcfce7' : '#fee2e2', padding: '2px 8px', borderRadius: '10px' }}>
                    💎 {credits} Créditos
                 </span>
               </div>
            </div>
            
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
              <div>
                <label style={{fontWeight:'600', fontSize:'0.85rem', marginBottom: '10px', display: 'block'}}>ELIGE TU EXPERTO</label>
                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                  {ROLES.map(role => (
                    <div 
                      key={role.id}
                      onClick={() => { setPersona(role.prompt); setName(role.name) }}
                      style={{
                        padding: '10px',
                        border: persona === role.prompt ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
                        borderRadius: '8px',
                        background: persona === role.prompt ? '#eff6ff' : 'white',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{display:'flex', alignItems:'center', gap:'8px', fontWeight:'600', fontSize:'0.9rem'}}>
                        <span>{role.icon}</span> {role.name}
                      </div>
                      <p style={{fontSize:'0.75rem', color:'#6b7280', margin:'4px 0 0 24px'}}>{role.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div><label style={{fontWeight:'600', fontSize:'0.85rem'}}>INSTRUCCIÓN (Editable)</label><textarea style={{...inputStyle, height: '60px', fontSize: '0.8rem'}} value={persona} onChange={e => setPersona(e.target.value)} placeholder="Selecciona un rol arriba..." /></div>
              
              <div style={{ padding: '15px', background: '#eff6ff', borderRadius: '8px', border: '1px dashed #2563eb' }}>
                <label style={{fontWeight:'600', fontSize:'0.85rem', color: '#1e40af', display: 'block', marginBottom: '8px'}}>📂 SUBIR PDF (Max 5MB)</label>
                <input type="file" accept="application/pdf" onChange={handleFileUpload} style={{ fontSize: '0.8rem' }} disabled={uploading} />
                <p style={{fontSize: '0.7rem', color: '#6b7280', marginTop: '8px', fontStyle: 'italic'}}>ℹ️ Nota: Asegúrate de que el PDF sea texto seleccionable, no una imagen escaneada.</p>
                {pdfName && <p style={{fontSize:'0.8rem', color:'#15803d', marginTop:'5px'}}>✅ {pdfName} listo</p>}
                {uploading && <div style={{marginTop:'10px'}}><LoadingDots /></div>}
              </div>

              <div style={{marginTop:'auto', paddingTop: '20px', display:'flex', gap:'10px'}}>
                <button disabled={loading} style={buttonStyle}>{loading ? '...' : 'Iniciar Chat'}</button>
                <button type="button" onClick={handleLogout} style={{...buttonStyle, background: '#ef4444', width: '80px'}}>Salir</button>
              </div>
            </form>
          </div>
        )}
        {showChat && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f9fafb' }}>
            <div style={{ padding: '16px 24px', background: 'white', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: '16px' }}>
              {isMobile && <button onClick={() => setChatStarted(false)}>⬅</button>}
              
              <div style={{display:'flex', flexDirection:'column'}}>
                  <span style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{fontSize: '1.2rem'}}>{ROLES.find(r => r.prompt === persona)?.icon || '🤖'}</span>
                    {name || 'Asistente'}
                  </span>
                  <span 
                    style={{ fontSize: '0.75rem', color: '#2563eb', cursor:'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }} 
                    onClick={downloadReport}
                  >
                    📥 Descargar Informe
                  </span>
              </div>

              <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#9ca3af' }}>💎 {credits}</span>
            </div>
            <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {messages.map((msg, idx) => (
                <div key={idx} style={{ alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                  <div className="markdown-body" style={{ background: msg.sender === 'user' ? colors.userBubble : colors.agentBubble, color: msg.sender === 'user' ? 'white' : '#1f2937', padding: '12px 16px', borderRadius: '12px', lineHeight: '1.6' }}>
                    <ReactMarkdown components={{ strong: ({node, ...props}) => <span style={{fontWeight: 'bold', color: msg.sender === 'user' ? '#fde047' : '#111827'}} {...props} /> }}>
                        {msg.text}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              {loading && !uploading && <LoadingDots />}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSend} style={{ padding: '24px', background: 'white', borderTop: `1px solid ${colors.border}`, display: 'flex', gap: '12px' }}>
              <input value={inputMsg} onChange={e => setInputMsg(e.target.value)} placeholder="Escribe aquí..." style={{ ...inputStyle, background: 'white' }} />
              <button disabled={loading} style={{...buttonStyle, width:'auto', padding:'0 24px'}}>➤</button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}





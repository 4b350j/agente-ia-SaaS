import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { createClient } from '@supabase/supabase-js'
import './App.css'

// 👇👇👇 TUS DATOS REALES AQUÍ 👇👇👇
const API_URL = "https://agente-ia-saas.onrender.com"
const SUPABASE_URL = "https://bvmwdavonhknysvfnybi.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2bXdkYXZvbmhrbnlzdmZueWJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4OTYyNDQsImV4cCI6MjA4MjQ3MjI0NH0.DJwhA13v9JoU_Oa7f3XZafxlSYlwBNcJdBb35ujNmpA"
// 👆👆👆 ------------------- 👆👆👆

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// --- FUNCIÓN DE "RESURRECCIÓN" ---
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
  
  // Estados de PDF
  const [pdfText, setPdfText] = useState('')
  const [pdfName, setPdfName] = useState('')
  const [uploading, setUploading] = useState(false)

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      // MEMORIA EFÍMERA: No cargamos historial al iniciar
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) { 
        setMessages([]); // Si sale, limpiamos todo
      }
    })
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => { window.removeEventListener('resize', handleResize); subscription.unsubscribe() }
  }, [])

  // Auto-scroll cada vez que cambian los mensajes o el estado de carga
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

  // MEMORIA EFÍMERA: Eliminamos saveMessageToDB y loadHistory
  // Los mensajes solo viven en el estado "messages" de React.

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

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
      
      // Mensaje del sistema confirmando subida (solo local)
      setMessages(prev => [...prev, { sender: 'agent', text: `✅ **Documento recibido:** ${data.filename}\n\nHe analizado el contenido. ¿Qué quieres saber?` }])
      
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
      const welcome = data.welcome_msg
      setMessages([{ sender: 'agent', text: welcome }])
      setChatStarted(true)
    } catch (err: any) { alert('No se pudo conectar con el servidor. Intenta de nuevo en unos segundos.') }
    setLoading(false)
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputMsg.trim()) return
    const userMsg = inputMsg
    
    // Guardar en estado local (Memoria Efímera)
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
      const reply = data.response
      
      // Guardar respuesta en estado local
      setMessages(prev => [...prev, { sender: 'agent', text: reply }])
    } catch (err) { 
        setMessages(prev => [...prev, { sender: 'agent', text: "⚠️ Error de conexión. Por favor reenvía tu mensaje." }])
    }
    setLoading(false)
  }

  // --- ESTILOS ---
  const colors = { bg: '#f3f4f6', cardBg: '#ffffff', textMain: '#111827', primary: '#2563eb', border: '#e5e7eb', userBubble: '#2563eb', agentBubble: '#f3f4f6' }
  const containerStyle: React.CSSProperties = { minHeight: '100vh', background: colors.bg, color: colors.textMain, fontFamily: '"Inter", sans-serif', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }
  const cardStyle: React.CSSProperties = { width: isMobile ? '100%' : '1000px', height: isMobile ? '90vh' : '85vh', background: colors.cardBg, borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: isMobile ? 'column' : 'row', border: `1px solid ${colors.border}` }
  const inputStyle: React.CSSProperties = { width: '100%', background: '#f9fafb', border: `1px solid ${colors.border}`, padding: '12px', borderRadius: '6px', outline: 'none' }
  const buttonStyle: React.CSSProperties = { padding: '12px', background: colors.primary, color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', width: '100%' }

  // Componente visual para los puntitos de carga
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

  const showSidebar = !isMobile || (isMobile && !chatStarted)
  const showChat = !isMobile || (isMobile && chatStarted)

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {showSidebar && (
          <div style={{ width: isMobile ? '100%' : '350px', padding: '32px', borderRight: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', overflowY: 'auto'}}>
            <div style={{marginBottom:'20px'}}>
               <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: colors.primary }}>Nexus AI 🧠</h2>
               <p style={{fontSize: '0.8rem', color: '#6b7280'}}>Usuario: {session.user.email}</p>
            </div>
            
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
              <div><label style={{fontWeight:'600', fontSize:'0.85rem'}}>NOMBRE</label><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Consultor" /></div>
              <div><label style={{fontWeight:'600', fontSize:'0.85rem'}}>INSTRUCCIÓN</label><textarea style={{...inputStyle, height: '100px'}} value={persona} onChange={e => setPersona(e.target.value)} placeholder="Ej: Eres un experto..." /></div>
              
              <div style={{ padding: '15px', background: '#eff6ff', borderRadius: '8px', border: '1px dashed #2563eb' }}>
                <label style={{fontWeight:'600', fontSize:'0.85rem', color: '#1e40af', display: 'block', marginBottom: '8px'}}>📂 SUBIR PDF (Max 5MB)</label>
                <input type="file" accept="application/pdf" onChange={handleFileUpload} style={{ fontSize: '0.8rem' }} disabled={uploading} />
                {pdfName && <p style={{fontSize:'0.8rem', color:'#15803d', marginTop:'5px'}}>✅ {pdfName} listo</p>}
                {uploading && <div style={{marginTop:'10px'}}><LoadingDots /></div>}
              </div>

              <div style={{marginTop:'auto', display:'flex', gap:'10px'}}>
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
              <span style={{ fontWeight: '600' }}>{name || 'Asistente'}</span>
            </div>
            <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {messages.map((msg, idx) => (
                <div key={idx} style={{ alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                  <div className="markdown-body" style={{ background: msg.sender === 'user' ? colors.userBubble : colors.agentBubble, color: msg.sender === 'user' ? 'white' : '#1f2937', padding: '12px 16px', borderRadius: '12px', lineHeight: '1.6' }}>
                    {/* 👇 AQUÍ ESTÁ LA MEJORA DE MARKDOWN 👇 */}
                    <ReactMarkdown 
                        components={{
                            // Ajustamos el color de negritas según quien habla
                            strong: ({node, ...props}) => <span style={{fontWeight: 'bold', color: msg.sender === 'user' ? '#fde047' : '#111827'}} {...props} />
                        }}
                    >
                        {msg.text}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              
              {/* 👇 AQUÍ ESTÁ LA MEJORA DE CARGA 👇 */}
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




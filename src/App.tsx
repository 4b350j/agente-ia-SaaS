import React, { useState, useRef, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

// 👇👇👇 ZONA DE CONFIGURACIÓN (Rellena esto otra vez) 👇👇👇

const API_URL = "https://agente-ia-saas.onrender.com" 
const SUPABASE_URL = "https://bvmwdavonhknysvfnybi.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2bXdkYXZvbmhrbnlzdmZueWJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4OTYyNDQsImV4cCI6MjA4MjQ3MjI0NH0.DJwhA13v9JoU_Oa7f3XZafxlSYlwBNcJdBb35ujNmpA"

// 👆👆👆 ------------------------------------------------ 👆👆👆

// Cliente Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

interface Message {
  sender: 'user' | 'agent';
  text: string;
}

export default function App() {
  const [name, setName] = useState('')
  const [persona, setPersona] = useState('')
  const [chatStarted, setChatStarted] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMsg, setInputMsg] = useState('')
  const [loading, setLoading] = useState(false)
  
  // --- NUEVO: ESTADOS PARA EL PDF ---
  const [pdfText, setPdfText] = useState('')       // Aquí guardamos el contenido del libro/PDF
  const [pdfName, setPdfName] = useState('')       // Nombre del archivo (ej: manual.pdf)
  const [uploading, setUploading] = useState(false)
  // ----------------------------------

  const [sessionId] = useState(() => {
    const saved = localStorage.getItem('chat_session_id')
    return saved || crypto.randomUUID()
  })

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem('chat_session_id', sessionId)
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    loadHistory()
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const loadHistory = async () => {
    const { data } = await supabase.from('messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })
    if (data && data.length > 0) {
      setMessages(data.map((msg: any) => ({ sender: msg.role, text: msg.content })))
      setChatStarted(true)
    }
  }

  const saveMessageToDB = async (role: 'user' | 'agent', content: string) => {
    await supabase.from('messages').insert([{ session_id: sessionId, role, content }])
  }

  // --- NUEVO: FUNCIÓN PARA SUBIR ARCHIVOS ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData
      })
      
      if (!res.ok) throw new Error('Error al subir')
      
      const data = await res.json()
      setPdfText(data.extracted_text) // Guardamos el texto del PDF en memoria
      setPdfName(data.filename)
      alert('✅ Documento analizado correctamente. La IA ahora conoce su contenido.')
      
    } catch (err) {
      alert('Error subiendo archivo. Asegúrate de que es un PDF.')
      console.error(err)
    }
    setUploading(false)
  }
  // ------------------------------------------

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/agents`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, persona })
      })
      const data = await res.json()
      const welcome = data.welcome_msg || "Sistema listo."
      setMessages([{ sender: 'agent', text: welcome }])
      saveMessageToDB('agent', welcome)
      setChatStarted(true)
    } catch (err: any) { alert('Error: ' + err.message) }
    setLoading(false)
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputMsg.trim()) return

    const userMsg = inputMsg
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }])
    setInputMsg('')
    setLoading(true)
    saveMessageToDB('user', userMsg)

    try {
      // ENVIAMOS EL CONTEXTO DEL PDF (Si existe)
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
          name, 
          persona, 
          history: messages, 
          message: userMsg,
          context: pdfText // <--- AQUÍ VA LA MAGIA DEL PDF
        })
      })
      const data = await res.json()
      const reply = data.response || "..."
      setMessages(prev => [...prev, { sender: 'agent', text: reply }])
      saveMessageToDB('agent', reply)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  // --- ESTILOS ---
  const colors = { bg: '#f3f4f6', cardBg: '#ffffff', textMain: '#111827', primary: '#2563eb', border: '#e5e7eb', userBubble: '#2563eb', agentBubble: '#f3f4f6' }
  const containerStyle: React.CSSProperties = { minHeight: '100vh', background: colors.bg, color: colors.textMain, fontFamily: '"Inter", sans-serif', display: 'flex', justifyContent: 'center', alignItems: isMobile ? 'flex-start' : 'center', padding: isMobile ? '0' : '20px' }
  const cardStyle: React.CSSProperties = { width: isMobile ? '100%' : '1000px', height: isMobile ? '100vh' : '85vh', background: colors.cardBg, borderRadius: isMobile ? '0' : '12px', boxShadow: isMobile ? 'none' : '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: isMobile ? 'column' : 'row', border: isMobile ? 'none' : `1px solid ${colors.border}` }
  const inputStyle: React.CSSProperties = { width: '100%', background: '#f9fafb', border: `1px solid ${colors.border}`, padding: '12px', borderRadius: '6px', outline: 'none' }
  const buttonStyle: React.CSSProperties = { padding: '12px', background: colors.primary, color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', width: '100%' }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {(!isMobile || !chatStarted) && (
          <div style={{ width: isMobile ? '100%' : '350px', padding: '32px', borderRight: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '32px', color: colors.primary }}>Nexus AI 🧠</h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
              <div><label style={{fontWeight:'600', fontSize:'0.85rem'}}>NOMBRE</label><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Analista Legal" /></div>
              <div><label style={{fontWeight:'600', fontSize:'0.85rem'}}>INSTRUCCIÓN</label><textarea style={{...inputStyle, height: '100px'}} value={persona} onChange={e => setPersona(e.target.value)} placeholder="Ej: Eres un experto en contratos..." /></div>
              
              {/* --- ZONA DE UPLOAD NUEVA --- */}
              <div style={{ padding: '15px', background: '#eff6ff', borderRadius: '8px', border: '1px dashed #2563eb' }}>
                <label style={{fontWeight:'600', fontSize:'0.85rem', color: '#1e40af', display: 'block', marginBottom: '8px'}}>📂 CONOCIMIENTO (PDF)</label>
                <input type="file" accept="application/pdf" onChange={handleFileUpload} style={{ fontSize: '0.8rem' }} disabled={uploading} />
                {uploading && <p style={{fontSize:'0.8rem', color:'#2563eb'}}>Analizando documento...</p>}
                {pdfName && <p style={{fontSize:'0.8rem', color:'#15803d', marginTop:'5px'}}>✅ {pdfName} cargado</p>}
              </div>
              {/* ---------------------------- */}

              <div style={{marginTop:'auto'}}><button disabled={loading} style={buttonStyle}>{loading ? 'Conectando...' : 'Iniciar Sesión'}</button></div>
            </form>
          </div>
        )}
        {(!isMobile || chatStarted) && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f9fafb' }}>
            <div style={{ padding: '16px 24px', background: 'white', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: '16px' }}>
              {isMobile && <button onClick={() => setChatStarted(false)}>⬅</button>}
              <span style={{ fontWeight: '600' }}>{name || 'Asistente'}</span>
              {pdfName && <span style={{ fontSize:'0.8rem', background:'#dcfce7', color:'#166534', padding:'4px 8px', borderRadius:'10px' }}>📄 Leyendo: {pdfName}</span>}
            </div>
            <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {messages.map((msg, idx) => (
                <div key={idx} style={{ alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                  <div style={{ background: msg.sender === 'user' ? colors.userBubble : colors.agentBubble, color: msg.sender === 'user' ? 'white' : '#1f2937', padding: '12px 16px', borderRadius: '12px' }}>{msg.text}</div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSend} style={{ padding: '24px', background: 'white', borderTop: `1px solid ${colors.border}`, display: 'flex', gap: '12px' }}>
              <input value={inputMsg} onChange={e => setInputMsg(e.target.value)} placeholder="Pregunta sobre el documento..." style={{ ...inputStyle, background: 'white' }} />
              <button disabled={loading} style={{...buttonStyle, width:'auto', padding:'0 24px'}}>Enviar</button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

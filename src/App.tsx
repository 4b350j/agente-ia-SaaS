import React, { useState, useRef, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

// 👇👇👇 ZONA DE CONFIGURACIÓN (Rellena esto) 👇👇👇

// 1. Tu URL del Backend (Render) - ¡SIN barra al final!
const API_URL = "https://agente-ia-saas.onrender.com" 

// 2. Tu URL de Supabase (Project URL)
const SUPABASE_URL = "https://bvmwdavonhknysvfnybi.supabase.co"

// 3. Tu Clave de Supabase (anon public key)
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2bXdkYXZvbmhrbnlzdmZueWJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4OTYyNDQsImV4cCI6MjA4MjQ3MjI0NH0.DJwhA13v9JoU_Oa7f3XZafxlSYlwBNcJdBb35ujNmpA"

// 👆👆👆 ------------------------------------------ 👆👆👆

// Iniciamos la conexión con la Base de Datos
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

interface Message {
  id?: number;
  sender: 'user' | 'agent';
  text: string;
  created_at?: string;
}

export default function App() {
  const [name, setName] = useState('')
  const [persona, setPersona] = useState('')
  const [chatStarted, setChatStarted] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMsg, setInputMsg] = useState('')
  const [loading, setLoading] = useState(false)
  
  // ID de Sesión (Para recuperar el chat si recargas la página)
  const [sessionId, setSessionId] = useState(() => {
    const saved = localStorage.getItem('chat_session_id')
    return saved || crypto.randomUUID()
  })

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem('chat_session_id', sessionId)
    // Cargar historial antiguo al iniciar
    loadHistory()
  }, [])

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // --- FUNCIÓN: Cargar historial de Supabase ---
  const loadHistory = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (data && data.length > 0) {
      // Convertimos el formato de la DB al formato de la App
      const history = data.map((msg: any) => ({
        sender: msg.role,
        text: msg.content
      }))
      setMessages(history)
      setChatStarted(true) // Si hay historial, saltamos directo al chat
    }
  }

  // --- FUNCIÓN: Guardar mensaje en Supabase ---
  const saveMessageToDB = async (role: 'user' | 'agent', content: string) => {
    await supabase.from('messages').insert([
      { session_id: sessionId, role: role, content: content }
    ])
  }

  // 1. Crear Agente (Solo si no hay historial previo)
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
      
      const welcomeText = data.welcome_msg || "Sistema iniciado."
      
      // Guardamos en estado y en DB
      setMessages([{ sender: 'agent', text: welcomeText }])
      saveMessageToDB('agent', welcomeText)
      
      setChatStarted(true)
    } catch (err: any) {
      alert('Error: ' + err.message)
    }
    setLoading(false)
  }

  // 2. Enviar Mensaje
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputMsg.trim()) return

    // 1. Mostrar mensaje del usuario inmediatamente
    const userMsg = inputMsg
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }])
    setInputMsg('')
    setLoading(true)

    // 2. Guardar mensaje del usuario en DB (en segundo plano)
    saveMessageToDB('user', userMsg)

    try {
      // 3. Enviar a la IA
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
          name, 
          persona, 
          history: messages, // Enviamos contexto
          message: userMsg 
        })
      })
      const data = await res.json()
      const reply = data.response || "..."

      // 4. Mostrar y Guardar respuesta de la IA
      setMessages(prev => [...prev, { sender: 'agent', text: reply }])
      saveMessageToDB('agent', reply)

    } catch (err) { console.error(err) }
    setLoading(false)
  }

  // --- ESTILOS (Mismo diseño Enterprise) ---
  const colors = { bg: '#f3f4f6', cardBg: '#ffffff', textMain: '#111827', primary: '#2563eb', border: '#e5e7eb', userBubble: '#2563eb', agentBubble: '#f3f4f6' }
  const containerStyle: React.CSSProperties = { minHeight: '100vh', background: colors.bg, color: colors.textMain, fontFamily: '"Inter", sans-serif', display: 'flex', justifyContent: 'center', alignItems: isMobile ? 'flex-start' : 'center', padding: isMobile ? '0' : '20px' }
  const cardStyle: React.CSSProperties = { width: isMobile ? '100%' : '1000px', height: isMobile ? '100vh' : '85vh', background: colors.cardBg, borderRadius: isMobile ? '0' : '12px', boxShadow: isMobile ? 'none' : '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: isMobile ? 'column' : 'row', border: isMobile ? 'none' : `1px solid ${colors.border}` }
  const inputStyle: React.CSSProperties = { width: '100%', background: '#f9fafb', border: `1px solid ${colors.border}`, padding: '12px', borderRadius: '6px', outline: 'none' }
  const buttonStyle: React.CSSProperties = { padding: '12px', background: colors.primary, color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {(!isMobile || !chatStarted) && (
          <div style={{ width: isMobile ? '100%' : '350px', padding: '32px', borderRight: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '32px', color: colors.primary }}>Nexus AI 🧠</h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1 }}>
              <div><label style={{fontWeight:'600', fontSize:'0.85rem'}}>NOMBRE</label><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Abogado Virtual" /></div>
              <div><label style={{fontWeight:'600', fontSize:'0.85rem'}}>INSTRUCCIÓN</label><textarea style={{...inputStyle, height: '140px'}} value={persona} onChange={e => setPersona(e.target.value)} /></div>
              <div style={{marginTop:'auto'}}><button disabled={loading} style={{...buttonStyle, width:'100%'}}>{loading ? 'Conectando...' : 'Iniciar Sesión'}</button></div>
            </form>
          </div>
        )}
        {(!isMobile || chatStarted) && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f9fafb' }}>
            <div style={{ padding: '16px 24px', background: 'white', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: '16px' }}>
              {isMobile && <button onClick={() => setChatStarted(false)}>⬅</button>}
              <span style={{ fontWeight: '600' }}>Sesión Activa</span>
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
              <input value={inputMsg} onChange={e => setInputMsg(e.target.value)} placeholder="Escriba aquí..." style={{ ...inputStyle, background: 'white' }} />
              <button disabled={loading} style={{...buttonStyle, padding: '0 24px'}}>Enviar</button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}



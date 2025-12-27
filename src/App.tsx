import React, { useState, useRef, useEffect } from 'react'

// 👇👇👇 TU URL DE RENDER AQUÍ 👇👇👇
const API_URL = "https://agente-ia-saas.onrender.com" 
// 👆👆👆 ----------------------- 👆👆👆

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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // --- LÓGICA (IGUAL QUE ANTES) ---
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/agents`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, persona })
      })
      if (!res.ok) throw new Error("Error en servidor")
      const data = await res.json()
      setMessages([{ sender: 'agent', text: data.welcome_msg || "Sistema iniciado correctamente." }])
      setChatStarted(true)
    } catch (err: any) {
      alert('Error de conexión: ' + err.message)
    }
    setLoading(false)
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputMsg.trim()) return
    const newHistory = [...messages, { sender: 'user', text: inputMsg } as Message]
    setMessages(newHistory)
    setInputMsg('')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, persona, history: newHistory.slice(1), message: inputMsg })
      })
      const data = await res.json()
      setMessages(prev => [...prev, { sender: 'agent', text: data.response || "..." }])
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  // --- ESTILOS "ENTERPRISE CLEAN" ---
  const colors = {
    bg: '#f3f4f6', // Gris muy claro de fondo
    cardBg: '#ffffff', // Blanco puro para tarjetas
    textMain: '#111827', // Negro suave
    textSec: '#6b7280', // Gris texto secundario
    primary: '#2563eb', // Azul Royal (Seguridad/Confianza)
    primaryHover: '#1d4ed8',
    border: '#e5e7eb', // Bordes sutiles
    userBubble: '#2563eb',
    agentBubble: '#f3f4f6'
  }

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh', background: colors.bg, color: colors.textMain, fontFamily: '"Inter", "Segoe UI", sans-serif',
    display: 'flex', justifyContent: 'center', alignItems: isMobile ? 'flex-start' : 'center', padding: isMobile ? '0' : '20px'
  }
  
  const cardStyle: React.CSSProperties = {
    width: isMobile ? '100%' : '1000px', height: isMobile ? '100vh' : '85vh', background: colors.cardBg,
    borderRadius: isMobile ? '0' : '12px', boxShadow: isMobile ? 'none' : '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden', display: 'flex', flexDirection: isMobile ? 'column' : 'row', border: isMobile ? 'none' : `1px solid ${colors.border}`
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#f9fafb', border: `1px solid ${colors.border}`, padding: '12px', borderRadius: '6px', 
    color: colors.textMain, outline: 'none', fontSize: '0.95rem', transition: 'border 0.2s'
  }

  const buttonStyle: React.CSSProperties = {
    padding: '12px', background: colors.primary, color: 'white', border: 'none', borderRadius: '6px', 
    fontWeight: '600', cursor: 'pointer', fontSize: '0.95rem', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
  }

  const showSidebar = !isMobile || (isMobile && !chatStarted)
  const showChat = !isMobile || (isMobile && chatStarted)

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        
        {/* PANEL CONFIGURACIÓN */}
        {showSidebar && (
          <div style={{ width: isMobile ? '100%' : '350px', padding: '32px', background: '#ffffff', borderRight: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', background: colors.primary, borderRadius: '6px' }}></div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>Nexus AI</h2>
            </div>
            
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1 }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '8px' }}>NOMBRE DEL ASISTENTE</label>
                <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Consultor Legal" />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '8px' }}>INSTRUCCIÓN DEL SISTEMA</label>
                <textarea style={{...inputStyle, height: '140px', resize: 'none'}} value={persona} onChange={e => setPersona(e.target.value)} placeholder="Define el rol y las restricciones de seguridad..." />
              </div>
              <div style={{ marginTop: 'auto' }}>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '16px', textAlign: 'center' }}>🔒 Conexión segura con Gemini 2.5</p>
                <button disabled={loading} style={{...buttonStyle, width: '100%'}}>{loading ? 'Conectando...' : 'Iniciar Sesión Segura'}</button>
              </div>
            </form>
          </div>
        )}

        {/* PANEL CHAT */}
        {showChat && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f9fafb' }}>
            {/* Cabecera Chat */}
            <div style={{ padding: '16px 24px', background: 'white', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
              {isMobile && <button onClick={() => setChatStarted(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>⬅</button>}
              <div style={{ width: '10px', height: '10px', background: '#10b981', borderRadius: '50%' }}></div>
              <span style={{ fontWeight: '600', color: '#111827' }}>{name}</span>
            </div>

            <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {messages.map((msg, idx) => (
                <div key={idx} style={{ 
                  alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '80%'
                }}>
                  <div style={{ 
                    background: msg.sender === 'user' ? colors.userBubble : colors.agentBubble,
                    color: msg.sender === 'user' ? 'white' : '#1f2937',
                    padding: '12px 16px', 
                    borderRadius: '12px',
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                    border: msg.sender === 'agent' ? `1px solid ${colors.border}` : 'none',
                    lineHeight: '1.5'
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {loading && <div style={{ alignSelf: 'flex-start', color: '#9ca3af', fontSize: '0.85rem', marginLeft: '10px' }}>Generando respuesta segura...</div>}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSend} style={{ padding: '24px', background: 'white', borderTop: `1px solid ${colors.border}`, display: 'flex', gap: '12px' }}>
              <input value={inputMsg} onChange={e => setInputMsg(e.target.value)} placeholder="Escriba su consulta..." style={{ ...inputStyle, background: 'white' }} />
              <button disabled={loading} style={{...buttonStyle, padding: '0 24px'}}>Enviar</button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}



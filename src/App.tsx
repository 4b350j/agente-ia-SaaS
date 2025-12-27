import React, { useState, useRef, useEffect } from 'react'

// 👇👇👇 ¡REVISA QUE TU URL ESTÉ ASÍ (SIN BARRA AL FINAL)! 👇👇👇
const API_URL = "https://agente-ia-saas.onrender.com"  
// 👆👆👆 --------------------------------------------------- 👆👆👆

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
  
  // Detectar móvil
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    // Scroll automático al final
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // 1. CREAR AGENTE (CON PROTECCIÓN ANTI-CRASH)
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      console.log("Intentando conectar a:", `${API_URL}/api/agents`)
      
      const res = await fetch(`${API_URL}/api/agents`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, persona })
      })

      if (!res.ok) {
        throw new Error(`Error del servidor: ${res.status}`)
      }

      const data = await res.json()
      
      // Protección: Si no hay mensaje, ponemos uno por defecto
      const welcomeText = data.welcome_msg || "¡Hola! Estoy listo (Sistema recuperado)."
      
      setMessages([{ sender: 'agent', text: welcomeText }])
      setChatStarted(true)

    } catch (err: any) {
      // ESTO TE DIRÁ QUÉ ESTÁ PASANDO EN EL MÓVIL
      alert('🔴 ERROR: ' + err.message + '\n\nRevisa la URL en App.tsx')
      console.error(err)
    }
    setLoading(false)
  }

  // 2. ENVIAR MENSAJE
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
        body: JSON.stringify({
          name,
          persona,
          history: newHistory.slice(1),
          message: inputMsg
        })
      })
      const data = await res.json()
      // Protección contra respuestas vacías
      const replyText = data.response || "..."
      setMessages(prev => [...prev, { sender: 'agent', text: replyText }])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  // ESTILOS (Igual que antes)
  const containerStyle: React.CSSProperties = {
    minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: 'Segoe UI, sans-serif',
    display: 'flex', justifyContent: 'center', alignItems: isMobile ? 'flex-start' : 'center', padding: isMobile ? '0' : '20px'
  }
  const cardStyle: React.CSSProperties = {
    width: isMobile ? '100%' : '900px', height: isMobile ? '100vh' : '85vh', background: '#1e293b',
    borderRadius: isMobile ? '0' : '20px', boxShadow: isMobile ? 'none' : '0 20px 50px rgba(0,0,0,0.5)',
    overflow: 'hidden', display: 'flex', flexDirection: isMobile ? 'column' : 'row'
  }

  const showSidebar = !isMobile || (isMobile && !chatStarted)
  const showChat = !isMobile || (isMobile && chatStarted)

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        
        {/* PANEL IZQUIERDO */}
        {showSidebar && (
          <div style={{ width: isMobile ? '100%' : '35%', padding: '30px', background: '#0f172a', display: 'flex', flexDirection: 'column', height: isMobile ? '100%' : 'auto' }}>
            <h2 style={{ color: '#38bdf8', marginBottom: '20px' }}>🤖 LAB IA</h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
              <div><label>NOMBRE</label><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Jarvis" /></div>
              <div><label>PERSONALIDAD</label><textarea style={{...inputStyle, height: '120px'}} value={persona} onChange={e => setPersona(e.target.value)} /></div>
              <button disabled={loading} style={{...buttonStyle, marginTop: 'auto'}}>{loading ? 'CONECTANDO...' : 'INICIAR'}</button>
            </form>
          </div>
        )}

        {/* PANEL DERECHO */}
        {showChat && (
          <div style={{ width: isMobile ? '100%' : '65%', display: 'flex', flexDirection: 'column', background: '#1e293b', height: '100%' }}>
            {isMobile && <div style={{ padding: '15px', background: '#0f172a', display: 'flex', gap: '10px' }}><button onClick={() => setChatStarted(false)}>⬅</button><b>{name}</b></div>}
            
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {messages.map((msg, idx) => (
                <div key={idx} style={{ 
                  alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  background: msg.sender === 'user' ? '#38bdf8' : '#334155',
                  color: msg.sender === 'user' ? '#0f172a' : '#f1f5f9',
                  padding: '12px 18px', borderRadius: '15px', maxWidth: '85%'
                }}>{msg.text}</div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSend} style={{ padding: '15px', background: '#0f172a', display: 'flex', gap: '10px' }}>
              <input value={inputMsg} onChange={e => setInputMsg(e.target.value)} placeholder="..." style={{ ...inputStyle, flex: 1 }} />
              <button disabled={loading} style={buttonStyle}>➤</button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle = { width: '100%', background: '#1e293b', border: '1px solid #334155', padding: '15px', borderRadius: '10px', color: 'white', outline: 'none' } as React.CSSProperties
const buttonStyle = { padding: '15px', background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '10px', fontWeight: 'bold' } as React.CSSProperties


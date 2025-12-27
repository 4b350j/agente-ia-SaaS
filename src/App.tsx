import React, { useState, useRef, useEffect } from 'react'

// 👇👇👇 ¡PEGA TU URL DE RENDER AQUÍ! (Sin barra al final) 👇👇👇
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
  
  // Detectar si es móvil (pantalla menor a 768px)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  const chatEndRef = useRef<HTMLDivElement>(null)

  // Escuchar cambios de tamaño de ventana
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // --- EFECTO DE VOZ ---
  useEffect(() => {
    const lastMsg = messages[messages.length - 1]
    if (lastMsg && lastMsg.sender === 'agent') {
      const speech = new SpeechSynthesisUtterance(lastMsg.text)
      window.speechSynthesis.speak(speech)
    }
  }, [messages])

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
      setMessages([{ sender: 'agent', text: data.welcome_msg }])
      setChatStarted(true)
    } catch (err) {
      alert('Error de conexión. Revisa la URL.')
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
      setMessages(prev => [...prev, { sender: 'agent', text: data.response }])
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  // --- ESTILOS RESPONSIVOS ---
  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#e2e8f0',
    fontFamily: 'Segoe UI, sans-serif',
    display: 'flex',
    justifyContent: 'center',
    alignItems: isMobile ? 'flex-start' : 'center', // En móvil pegado arriba
    padding: isMobile ? '0' : '20px'
  }

  const cardStyle: React.CSSProperties = {
    width: isMobile ? '100%' : '900px',
    height: isMobile ? '100vh' : '85vh', // En móvil ocupa toda la altura
    background: '#1e293b',
    borderRadius: isMobile ? '0' : '20px', // Sin bordes redondos en móvil
    boxShadow: isMobile ? 'none' : '0 20px 50px rgba(0,0,0,0.5)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row' // Columna en móvil, Fila en PC
  }

  // Lógica de Vistas para Móvil
  const showSidebar = !isMobile || (isMobile && !chatStarted)
  const showChat = !isMobile || (isMobile && chatStarted)

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        
        {/* PANEL IZQUIERDO (Configuración) */}
        {showSidebar && (
          <div style={{ 
            width: isMobile ? '100%' : '35%', 
            padding: '30px', 
            background: '#0f172a', 
            borderRight: isMobile ? 'none' : '1px solid #334155',
            display: 'flex', flexDirection: 'column',
            height: isMobile ? '100%' : 'auto'
          }}>
            <h2 style={{ color: '#38bdf8', marginBottom: '20px', fontSize: '1.5rem' }}>🤖 LAB IA</h2>
            
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
              <div>
                <label style={{ fontSize: '0.9rem', color: '#94a3b8', display: 'block', marginBottom: '8px' }}>NOMBRE</label>
                <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Jarvis" />
              </div>
              <div>
                <label style={{ fontSize: '0.9rem', color: '#94a3b8', display: 'block', marginBottom: '8px' }}>PERSONALIDAD</label>
                <textarea style={{...inputStyle, height: '120px', resize: 'none'}} value={persona} onChange={e => setPersona(e.target.value)} placeholder="Ej: Experto en marketing..." />
              </div>
              <button disabled={loading} style={{...buttonStyle, marginTop: 'auto'}}>{loading ? 'CONECTANDO...' : 'INICIAR AGENTE'}</button>
            </form>
          </div>
        )}

        {/* PANEL DERECHO (Chat) */}
        {showChat && (
          <div style={{ width: isMobile ? '100%' : '65%', display: 'flex', flexDirection: 'column', background: '#1e293b', height: '100%' }}>
            
            {/* Cabecera Móvil (Botón atrás) */}
            {isMobile && chatStarted && (
              <div style={{ padding: '15px', background: '#0f172a', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button onClick={() => setChatStarted(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem' }}>⬅</button>
                <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>{name}</span>
              </div>
            )}

            <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {!chatStarted && !isMobile ? (
                <div style={{ color: '#64748b', textAlign: 'center', marginTop: '100px' }}><h3>ESPERANDO...</h3></div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} style={{ 
                    alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                    background: msg.sender === 'user' ? '#38bdf8' : '#334155',
                    color: msg.sender === 'user' ? '#0f172a' : '#f1f5f9',
                    padding: '12px 18px', borderRadius: '15px', maxWidth: '85%', lineHeight: '1.4',
                    borderBottomRightRadius: msg.sender === 'user' ? '2px' : '15px',
                    borderTopLeftRadius: msg.sender === 'agent' ? '2px' : '15px',
                  }}>{msg.text}</div>
                ))
              )}
              {loading && <div style={{ color: '#94a3b8', fontSize: '0.8rem', alignSelf: 'flex-start' }}>Escribiendo...</div>}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSend} style={{ padding: '15px', background: '#0f172a', borderTop: '1px solid #334155', display: 'flex', gap: '10px' }}>
              <input value={inputMsg} onChange={e => setInputMsg(e.target.value)} placeholder="Mensaje..." style={{ ...inputStyle, flex: 1 }} />
              <button disabled={loading} style={{ ...buttonStyle, width: 'auto', padding: '0 20px' }}>➤</button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle = { width: '100%', background: '#1e293b', border: '1px solid #334155', padding: '15px', borderRadius: '10px', color: 'white', outline: 'none', fontSize: '1rem' } as React.CSSProperties
const buttonStyle = { width: '100%', padding: '15px', background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' } as React.CSSProperties

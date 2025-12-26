import React, { useState, useRef, useEffect } from 'react'

// Tipos para TypeScript
interface Message {
  sender: 'user' | 'agent';
  text: string;
}

export default function App() {
  // Estados
  const [name, setName] = useState('')
  const [persona, setPersona] = useState('')
  const [chatStarted, setChatStarted] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMsg, setInputMsg] = useState('')
  const [loading, setLoading] = useState(false)
  
  // Referencia para bajar el scroll del chat automáticamente
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // 1. CREAR EL AGENTE
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('http://localhost:8000/api/agents', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, persona })
      })
      const data = await res.json()
      
      // Iniciamos el chat con el mensaje de bienvenida
      setMessages([{ sender: 'agent', text: data.welcome_msg }])
      setChatStarted(true)
    } catch (err) {
      alert('Error conectando con el servidor')
    }
    setLoading(false)
  }

  // 2. ENVIAR MENSAJE AL CHAT
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputMsg.trim()) return

    // Añadir mi mensaje
    const newHistory = [...messages, { sender: 'user', text: inputMsg } as Message]
    setMessages(newHistory)
    setInputMsg('')
    setLoading(true)

    try {
      const res = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          name,
          persona,
          history: newHistory.slice(1), // Enviamos historial sin el saludo inicial (opcional)
          message: inputMsg
        })
      })
      const data = await res.json()
      
      // Añadir respuesta del agente
      setMessages(prev => [...prev, { sender: 'agent', text: data.response }])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  // --- DISEÑO ---
  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: 'Segoe UI, sans-serif', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      
      <div style={{ width: '900px', height: '80vh', background: '#1e293b', borderRadius: '20px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex' }}>
        
        {/* PARTE IZQUIERDA: CONFIGURACIÓN */}
        <div style={{ width: '35%', padding: '30px', background: '#0f172a', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ color: '#38bdf8', marginBottom: '20px', fontSize: '1.5rem' }}>🤖 LAB IA</h2>
          
          {!chatStarted ? (
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ fontSize: '0.9rem', color: '#94a3b8', display: 'block', marginBottom: '8px' }}>NOMBRE</label>
                <input 
                  style={inputStyle} 
                  value={name} onChange={e => setName(e.target.value)} 
                  placeholder="Ej: Iron Man" 
                />
              </div>
              <div>
                <label style={{ fontSize: '0.9rem', color: '#94a3b8', display: 'block', marginBottom: '8px' }}>PERSONALIDAD</label>
                <textarea 
                  style={{...inputStyle, height: '120px', resize: 'none'}} 
                  value={persona} onChange={e => setPersona(e.target.value)} 
                  placeholder="Ej: Genio, millonario, playboy, filántropo..." 
                />
              </div>
              <button 
                disabled={loading}
                style={buttonStyle}
              >
                {loading ? 'ACTIVANDO...' : 'INICIAR SISTEMA'}
              </button>
            </form>
          ) : (
            <div style={{ marginTop: 'auto' }}>
              <div style={{ padding: '15px', background: '#334155', borderRadius: '10px', marginBottom: '20px' }}>
                <strong style={{ color: '#38bdf8' }}>Agente Activo:</strong>
                <p style={{ margin: '5px 0 0 0', fontSize: '1.2rem' }}>{name}</p>
              </div>
              <button onClick={() => setChatStarted(false)} style={{...buttonStyle, background: '#ef4444'}}>
                REINICIAR
              </button>
            </div>
          )}
        </div>

        {/* PARTE DERECHA: CHAT */}
        <div style={{ width: '65%', display: 'flex', flexDirection: 'column', background: '#1e293b' }}>
          
          {/* Zona de mensajes */}
          <div style={{ flex: 1, padding: '30px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {!chatStarted ? (
              <div style={{ color: '#64748b', textAlign: 'center', marginTop: '100px' }}>
                <h3 style={{ opacity: 0.5 }}>ESPERANDO CONFIGURACIÓN...</h3>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} style={{ 
                  alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  background: msg.sender === 'user' ? '#38bdf8' : '#334155',
                  color: msg.sender === 'user' ? '#0f172a' : '#f1f5f9',
                  padding: '12px 18px',
                  borderRadius: '15px',
                  maxWidth: '75%',
                  lineHeight: '1.5',
                  borderBottomRightRadius: msg.sender === 'user' ? '2px' : '15px',
                  borderTopLeftRadius: msg.sender === 'agent' ? '2px' : '15px',
                }}>
                  {msg.text}
                </div>
              ))
            )}
            {loading && chatStarted && <div style={{ color: '#94a3b8', fontSize: '0.9rem', fontStyle: 'italic' }}>Escribiendo...</div>}
            <div ref={chatEndRef} />
          </div>

          {/* Zona de escritura */}
          {chatStarted && (
            <form onSubmit={handleSend} style={{ padding: '20px', background: '#0f172a', borderTop: '1px solid #334155', display: 'flex', gap: '10px' }}>
              <input 
                value={inputMsg}
                onChange={e => setInputMsg(e.target.value)}
                placeholder="Escribe tu mensaje..."
                style={{ ...inputStyle, flex: 1 }}
              />
              <button disabled={loading} style={{ ...buttonStyle, width: 'auto', padding: '0 25px' }}>
                ➔
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// Estilos rápidos
const inputStyle = {
  width: '100%',
  background: '#1e293b',
  border: '1px solid #334155',
  padding: '12px',
  borderRadius: '8px',
  color: 'white',
  outline: 'none',
  fontSize: '1rem'
} as React.CSSProperties

const buttonStyle = {
  width: '100%',
  padding: '15px',
  background: '#38bdf8',
  color: '#0f172a',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: '0.2s',
  fontSize: '1rem'
} as React.CSSProperties
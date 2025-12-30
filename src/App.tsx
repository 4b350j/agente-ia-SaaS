import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { createClient } from '@supabase/supabase-js'
import { jsPDF } from 'jspdf'
import './App.css' // <--- IMPORTANTE: CONECTA EL DISEÑO

// MODO SEGURO (PRODUCCIÓN)
const API_URL = import.meta.env.VITE_API_URL
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY


const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// --- CONFIGURACIÓN DE ROLES ---
const ROLES = [
  { 
    id: 'lawyer_general', name: 'Abogado General', icon: '⚖️', desc: 'Detecto riesgos legales y cláusulas abusivas.',
    prompt: `Actúa como un abogado senior experto en derecho contractual. Analiza el documento buscando riesgos legales, ambigüedades y cláusulas abusivas.` 
  },
  { 
    id: 'lawyer_labor', name: 'Laboralista', icon: '👷', desc: 'Reviso contratos laborales y despidos.',
    prompt: `Actúa como un abogado laboralista experto. Analiza violaciones de derechos laborales, finiquitos y cláusulas abusivas.` 
  },
  { 
    id: 'auditor', name: 'Auditor Financiero', icon: '💰', desc: 'Busco errores numéricos y fugas.',
    prompt: `Actúa como un auditor financiero (Big 4). Busca incoherencias numéricas, gastos duplicados y riesgos.` 
  },
  { 
    id: 'summarizer', name: 'Resumidor', icon: '📝', desc: 'Resumo lo esencial en segundos.',
    prompt: `Sintetiza la información clave, fechas e importes en una lista con viñetas. Ignora la paja.` 
  },
  {
    id: 'translator', name: 'Traductor Jurídico', icon: '🌍', desc: 'Traduzco jerga legal a español simple.',
    prompt: `Actúa como traductor jurado. Traduce o explica la jerga legal compleja en lenguaje sencillo.`
  }
]

// --- FUNCIÓN DE CONEXIÓN ROBUSTA ---
async function fetchWithRetry(url: string, options: any, retries = 3, backoff = 1000) {
  try {
    const res = await fetch(url, options)
    if (!res.ok) {
        if (res.status === 503 || res.status === 504) throw new Error("Servidor durmiendo...")
        return res
    }
    return res
  } catch (err) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, backoff))
      return fetchWithRetry(url, options, retries - 1, backoff * 2)
    }
    throw err
  }
}

export default function App() {
  // --- ESTADOS ---
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

  // ESTADO ÚNICO DE MÓVIL
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [credits, setCredits] = useState(3)

  const useCredit = () => {
    if (credits > 0) { setCredits(prev => prev - 1); return true }
    return false
  }

  // --- PDF ---
  const downloadReport = () => {
    try {
      const doc = new jsPDF()
      const margin = 15; let y = 20
      doc.setFontSize(18); doc.setTextColor(37, 99, 235); doc.text(`Informe Nexus AI`, margin, y); y += 10
      doc.setFontSize(10); doc.setTextColor(100); doc.text(`Archivo: ${pdfName || 'Sin nombre'}`, margin, y); y += 10
      doc.line(margin, y, 195, y); y += 15
      doc.setFontSize(11); doc.setTextColor(0)
      
      messages.forEach((msg) => {
          doc.setFont("helvetica", "bold"); doc.text(msg.sender === 'user' ? 'TÚ:' : 'AGENTE:', margin, y); y += 6
          doc.setFont("helvetica", "normal")
          const cleanText = (msg.text || '').replace(/\*\*/g, '').replace(/#/g, '')
          const splitText = doc.splitTextToSize(cleanText, 180)
          doc.text(splitText, margin, y); y += (splitText.length * 6) + 10
          if (y > 270) { doc.addPage(); y = 20 }
      })
      doc.save('Informe.pdf')
    } catch (e) {
      alert("Error al generar PDF. Inténtalo de nuevo.")
    }
  }

  // --- EFECTOS ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => { window.removeEventListener('resize', handleResize); subscription.unsubscribe() }
  }, [])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, loading])

  // --- LÓGICA DE PANTALLAS ---
  const showSidebar = !isMobile || (isMobile && !chatStarted)
  const showChat = !isMobile || (isMobile && chatStarted)

  // --- ACCIONES ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    const { error } = authMode === 'login' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password })
    setLoading(false); if (error) alert(error.message)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setChatStarted(false); setMessages([]); setName(''); setPersona('')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (credits <= 0) { alert(`🔒 Límite de sesión alcanzado. Recarga (F5) para limpiar.`); e.target.value = ''; return }
    
    setUploading(true)
    const formData = new FormData(); formData.append('file', file)
    try {
      const res = await fetchWithRetry(`${API_URL}/api/upload`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error("Error al leer PDF")
      const data = await res.json()
      
      setPdfText(data.extracted_text); setPdfName(data.filename); useCredit()
      setMessages(prev => [...prev, { sender: 'agent', text: `✅ Leído: ${data.filename}. Te quedan ${credits-1} créditos.` }])
    } catch (err: any) { alert('Error: ' + err.message) }
    setUploading(false)
  }

  // ⭐ NUEVA VERSIÓN: BIENVENIDA INSTANTÁNEA (UX MEJORADA)
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    // No llamamos al servidor. Creamos el mensaje localmente.
    const roleDesc = ROLES.find(r => r.name === name)?.desc || 'Estoy listo para ayudarte.'
    
    setMessages([{ 
        sender: 'agent', 
        text: `👋 Hola, soy tu **${name}**.\n\n${roleDesc}\n\n¿Qué duda tienes sobre el documento?` 
    }])
    setChatStarted(true)
  }
  
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault(); if (!inputMsg.trim()) return
    const userMsg = inputMsg; setMessages(prev => [...prev, { sender: 'user', text: userMsg }]); setInputMsg(''); setLoading(true)
    try {
      const res = await fetchWithRetry(`${API_URL}/api/chat`, { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, persona, history: messages, message: userMsg, context: pdfText }) 
      })
      const data = await res.json()
      setMessages(prev => [...prev, { sender: 'agent', text: data.response }])
    } catch (err) { setMessages(prev => [...prev, { sender: 'agent', text: "⚠️ Error de conexión." }]) }
    setLoading(false)
  }

  // --- RENDERIZADO ---
  
  const containerStyle: React.CSSProperties = { height: '100dvh', width: '100vw', background: '#f3f4f6', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: isMobile ? 0 : '20px', overflow: 'hidden' }
  const cardStyle: React.CSSProperties = { width: isMobile ? '100%' : '1000px', height: isMobile ? '100%' : '85vh', background: 'white', borderRadius: isMobile ? 0 : '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden' }
  const btnStyle: React.CSSProperties = { padding: '14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', width: '100%', fontSize: '1rem', cursor: 'pointer', fontWeight: '600' }

  if (!session) return (
    <div style={containerStyle}>
      <div style={{...cardStyle, width:'400px', height:'auto', flexDirection:'column', padding:'40px', borderRadius:'12px', border:'1px solid #e5e7eb'}}>
        <h2 style={{color:'#2563eb', textAlign:'center', marginBottom:'20px'}}>🔐 Nexus AI Login</h2>
        <form onSubmit={handleAuth} style={{display:'flex', flexDirection:'column', gap:'15px'}}>
          <input type="email" placeholder="Correo electrónico" value={email} onChange={e=>setEmail(e.target.value)} style={{padding:'14px', borderRadius:'8px', border:'1px solid #e5e7eb', fontSize:'16px'}} required />
          <input type="password" placeholder="Contraseña" value={password} onChange={e=>setPassword(e.target.value)} style={{padding:'14px', borderRadius:'8px', border:'1px solid #e5e7eb', fontSize:'16px'}} required />
          <button style={btnStyle} disabled={loading}>{loading ? 'Cargando...' : (authMode === 'login' ? 'Entrar' : 'Crear Cuenta')}</button>
        </form>
        <p style={{textAlign:'center', marginTop:'15px', color:'#6b7280', fontSize:'0.9rem'}} onClick={()=>setAuthMode(authMode==='login'?'register':'login')}>
          {authMode==='login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}
        </p>
      </div>
    </div>
  )

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        
        {/* SIDEBAR (MENÚ) */}
        {showSidebar && (
          <div style={{ width: isMobile ? '100%' : '350px', padding: '16px', borderRight: '1px solid #e5e7eb', background: '#f8fafc', overflowY: 'auto' }}>
            <div style={{marginBottom:'20px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <h2 style={{color:'#2563eb', fontSize:'1.4rem', fontWeight:'bold'}}>Nexus AI 🛡️</h2>
              <span style={{background: credits>0?'#dcfce7':'#fee2e2', color: credits>0?'#16a34a':'#dc2626', padding:'4px 10px', borderRadius:'20px', fontSize:'0.8rem', fontWeight:'bold'}}>
                💎 {credits}
              </span>
            </div>

            <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
              <label style={{fontSize:'0.8rem', color:'#6b7280', fontWeight:'bold'}}>1. ELIGE EXPERTO</label>
              {ROLES.map(r => (
                <div key={r.id} onClick={()=>{setName(r.name); setPersona(r.prompt)}} style={{
                  padding:'16px', 
                  border: persona===r.prompt ? '2px solid #2563eb' : '1px solid #e5e7eb', 
                  borderRadius:'10px', 
                  background: persona===r.prompt ? '#eff6ff' : 'white', 
                  cursor:'pointer'
                }}>
                  <div style={{fontWeight:'bold', display:'flex', gap:'8px'}}><span>{r.icon}</span> {r.name}</div>
                  <div style={{fontSize:'0.8rem', color:'#6b7280', marginTop:'4px'}}>{r.desc}</div>
                </div>
              ))}
            </div>

            <div style={{marginTop:'20px', padding:'15px', border:'1px dashed #2563eb', borderRadius:'10px', background:'white'}}>
              <label style={{fontSize:'0.8rem', color:'#1e40af', fontWeight:'bold', marginBottom:'5px', display:'block'}}>2. SUBIR PDF</label>
              <input type="file" onChange={handleFileUpload} accept="application/pdf" disabled={uploading} style={{fontSize:'0.9rem', width:'100%'}} />
              {pdfName && <p style={{fontSize:'0.8rem', color:'green', marginTop:'5px'}}>✅ {pdfName}</p>}
            </div>

            <div style={{marginTop:'auto', paddingTop:'20px'}}>
               <button onClick={handleCreate} disabled={!persona} style={btnStyle}>Iniciar Chat</button>
               <button onClick={handleLogout} style={{...btnStyle, background:'white', color:'#ef4444', border:'1px solid #ef4444', marginTop:'10px'}}>Cerrar Sesión</button>
            </div>
          </div>
        )}

        {/* CHAT */}
        {showChat && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background:'white' }}>
            <div style={{padding:'16px', borderBottom:'1px solid #e5e7eb', display:'flex', alignItems:'center', gap:'10px', background:'white', boxShadow:'0 2px 4px rgba(0,0,0,0.05)', zIndex:10}}>
              {isMobile && <button onClick={()=>setChatStarted(false)} style={{background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer'}}>⬅</button>}
              <div>
                <strong style={{display:'block'}}>{name || 'Asistente'}</strong>
                <span onClick={downloadReport} style={{fontSize:'0.8rem', color:'#2563eb', cursor:'pointer'}}>📥 Descargar PDF</span>
              </div>
            </div>

            <div style={{flex:1, padding:'20px', overflowY:'auto', background:'#f9fafb', display:'flex', flexDirection:'column', gap:'15px'}}>
              {messages.map((m,i)=>(
                <div key={i} style={{alignSelf: m.sender==='user'?'flex-end':'flex-start', maxWidth:'85%'}}>
                  <div style={{
                    padding:'12px 16px', 
                    borderRadius:'16px', 
                    background: m.sender==='user'?'#2563eb':'white', 
                    color: m.sender==='user'?'white':'#1f2937',
                    boxShadow:'0 1px 2px rgba(0,0,0,0.1)',
                    border: m.sender==='agent'?'1px solid #e5e7eb':'none'
                  }}>
                    <ReactMarkdown components={{ strong: ({node, ...props}) => <span style={{fontWeight:'bold', color: m.sender==='user'?'#fde047':'inherit'}} {...props}/> }}>
                      {m.text}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef}/>
              {loading && !uploading && <div style={{padding:'10px', color:'#6b7280', fontSize:'0.9rem'}}>Escribiendo...</div>}
            </div>

            <form onSubmit={handleSend} style={{padding:'15px', borderTop:'1px solid #e5e7eb', display:'flex', gap:'10px', background:'white'}}>
              <input 
                value={inputMsg} 
                onChange={e=>setInputMsg(e.target.value)} 
                placeholder="Escribe tu pregunta..." 
                style={{flex:1, padding:'14px', borderRadius:'10px', border:'1px solid #e5e7eb', fontSize:'16px', outline:'none'}} 
              />
              <button style={{...btnStyle, width:'auto', padding:'0 20px', borderRadius:'10px'}}>➤</button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}








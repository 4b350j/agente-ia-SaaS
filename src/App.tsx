import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm' // <--- IMPORTANTE: Para las tablas
import { createClient } from '@supabase/supabase-js'
import { jsPDF } from 'jspdf'
import './App.css'

// 👇 MODO SEGURO (VARIABLES DE ENTORNO)
const API_URL = import.meta.env.VITE_API_URL
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// --- CONFIGURACIÓN DE ROLES ---
const ROLES = [
  { 
    id: 'lawyer_general', name: 'Abogado General', icon: '⚖️', desc: 'Detecto riesgos legales y cláusulas abusivas.',
    prompt: `Actúa como un abogado senior experto en derecho contractual. Analiza el documento buscando riesgos legales, ambigüedades y cláusulas abusivas. Usa tablas para listar los riesgos si hay más de 3.` 
  },
  { 
    id: 'lawyer_labor', name: 'Laboralista', icon: '👷', desc: 'Reviso contratos laborales y despidos.',
    prompt: `Actúa como un abogado laboralista experto. Analiza violaciones de derechos laborales, finiquitos y cláusulas abusivas.` 
  },
  { 
    id: 'auditor', name: 'Auditor Financiero', icon: '💰', desc: 'Busco errores numéricos y fugas.',
    prompt: `Actúa como un auditor financiero (Big 4). Busca incoherencias numéricas. Si encuentras datos, preséntalos SIEMPRE en una tabla comparativa.` 
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

  // Estado Móvil
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  
  // UX: Notificaciones y Créditos
  const [notification, setNotification] = useState<{msg: string, type: 'error'|'success'|'info'} | null>(null)
  const [credits, setCredits] = useState(3)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Helper de Notificaciones
  const showToast = (msg: string, type: 'error'|'success'|'info' = 'info') => {
    setNotification({ msg, type })
    setTimeout(() => setNotification(null), 3000)
  }

  const useCredit = () => {
    if (credits > 0) { setCredits(prev => prev - 1); return true }
    return false
  }

  // --- EFECTOS ---
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (chatStarted && messages.length > 1) {
        e.preventDefault(); e.returnValue = ''; return ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    
    return () => { 
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      subscription.unsubscribe() 
    }
  }, [chatStarted, messages])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, loading])

  // --- ACCIONES ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    const { error } = authMode === 'login' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password })
    setLoading(false); if (error) showToast(error.message, 'error')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setChatStarted(false); setMessages([]); setName(''); setPersona('')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (credits <= 0) { showToast(`🔒 Límite diario alcanzado.`, 'error'); e.target.value = ''; return }
    
    setUploading(true)
    const formData = new FormData(); formData.append('file', file)
    try {
      const res = await fetchWithRetry(`${API_URL}/api/upload`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error("Error leyendo PDF")
      const data = await res.json()
      
      setPdfText(data.extracted_text); setPdfName(data.filename); useCredit()
      setMessages(prev => [...prev, { sender: 'agent', text: `✅ **Documento recibido:** ${data.filename}\n\nHe extraído el contenido. Te quedan **${credits-1}** créditos.\n\n¿Qué quieres que analice?` }])
    } catch (err: any) { showToast(err.message, 'error') }
    setUploading(false)
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    const roleDesc = ROLES.find(r => r.name === name)?.desc || 'Listo.'
    setMessages([{ 
        sender: 'agent', 
        text: `👋 Hola, soy tu **${name}**.\n\n${roleDesc}\n\n¿En qué puedo ayudarte hoy?` 
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
    } catch (err) { setMessages(prev => [...prev, { sender: 'agent', text: "⚠️ Error de conexión. Inténtalo de nuevo." }]) }
    setLoading(false)
  }

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
      doc.save(`Informe_${name.replace(/\s/g, '_')}.pdf`)
      showToast("Informe descargado", "success")
    } catch (e) { showToast("Error al generar PDF", "error") }
  }

  // --- RENDERIZADO ---
  const showSidebar = !isMobile || (isMobile && !chatStarted)
  const showChat = !isMobile || (isMobile && chatStarted)
  
  const containerStyle: React.CSSProperties = { height: '100dvh', width: '100vw', background: '#f3f4f6', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: isMobile ? 0 : '20px', overflow: 'hidden' }
  const cardStyle: React.CSSProperties = { width: isMobile ? '100%' : '1000px', height: isMobile ? '100%' : '85vh', background: 'white', borderRadius: isMobile ? 0 : '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden' }
  const btnStyle: React.CSSProperties = { padding: '14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', width: '100%', fontSize: '1rem', cursor: 'pointer', fontWeight: '600' }

  if (!session) return (
    <div style={containerStyle}>
      {notification && <div style={{position:'fixed', top:'20px', left:'50%', transform:'translateX(-50%)', background: notification.type==='error'?'#fee2e2':'#dcfce7', color: notification.type==='error'?'#dc2626':'#16a34a', padding:'10px 20px', borderRadius:'30px', boxShadow:'0 4px 12px rgba(0,0,0,0.1)', zIndex:1000, fontWeight:'bold'}}><span>{notification.type==='error'?'⚠️':'✅'}</span> {notification.msg}</div>}
      <div style={{...cardStyle, width:'400px', height:'auto', flexDirection:'column', padding:'40px', borderRadius:'12px', border:'1px solid #e5e7eb'}}>
        <h2 style={{color:'#2563eb', textAlign:'center', marginBottom:'20px'}}>🔐 Nexus AI</h2>
        <form onSubmit={handleAuth} style={{display:'flex', flexDirection:'column', gap:'15px'}}>
          <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} style={{padding:'14px', borderRadius:'8px', border:'1px solid #e5e7eb', fontSize:'16px'}} required />
          <input type="password" placeholder="Contraseña" value={password} onChange={e=>setPassword(e.target.value)} style={{padding:'14px', borderRadius:'8px', border:'1px solid #e5e7eb', fontSize:'16px'}} required />
          <button style={btnStyle} disabled={loading}>{loading ? '...' : (authMode === 'login' ? 'Entrar' : 'Registrarme')}</button>
        </form>
        <p style={{textAlign:'center', marginTop:'15px', color:'#6b7280', fontSize:'0.9rem', cursor:'pointer'}} onClick={()=>setAuthMode(authMode==='login'?'register':'login')}>
          {authMode==='login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}
        </p>
      </div>
    </div>
  )

  return (
    <div style={containerStyle}>
      {/* TOAST FLOTANTE */}
      {notification && <div style={{position:'fixed', top:'20px', left:'50%', transform:'translateX(-50%)', background: notification.type==='error'?'#fee2e2':'#dcfce7', color: notification.type==='error'?'#dc2626':'#16a34a', padding:'10px 20px', borderRadius:'30px', boxShadow:'0 4px 12px rgba(0,0,0,0.1)', zIndex:1000, fontWeight:'bold', display:'flex', alignItems:'center', gap:'8px'}}><span>{notification.type==='error'?'⚠️':'✅'}</span> {notification.msg}</div>}

      <div style={cardStyle}>
        
        {/* MENÚ LATERAL */}
        {showSidebar && (
          <div style={{ width: isMobile ? '100%' : '350px', padding: '16px', borderRight: '1px solid #e5e7eb', background: '#f8fafc', overflowY: 'auto' }}>
            <div style={{marginBottom:'20px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <h2 style={{color:'#2563eb', fontSize:'1.4rem', fontWeight:'bold'}}>Nexus AI 🛡️</h2>
              <span style={{background: credits>0?'#dcfce7':'#fee2e2', color: credits>0?'#16a34a':'#dc2626', padding:'4px 10px', borderRadius:'20px', fontSize:'0.8rem', fontWeight:'bold'}}>💎 {credits}</span>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
              <label style={{fontSize:'0.75rem', color:'#64748b', fontWeight:'bold', letterSpacing:'0.5px'}}>1. SELECCIONA EXPERTO</label>
              {ROLES.map(r => (
                <div key={r.id} onClick={()=>{setName(r.name); setPersona(r.prompt)}} style={{
                  padding:'16px', border: persona===r.prompt ? '2px solid #2563eb' : '1px solid #e2e8f0', 
                  borderRadius:'10px', background: persona===r.prompt ? '#eff6ff' : 'white', cursor:'pointer', transition: 'all 0.2s'
                }}>
                  <div style={{fontWeight:'bold', display:'flex', gap:'8px', color:'#1e293b'}}><span>{r.icon}</span> {r.name}</div>
                  <div style={{fontSize:'0.8rem', color:'#64748b', marginTop:'4px'}}>{r.desc}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:'20px', padding:'15px', border:'1px dashed #94a3b8', borderRadius:'10px', background:'white'}}>
              <label style={{fontSize:'0.75rem', color:'#64748b', fontWeight:'bold', marginBottom:'8px', display:'block', letterSpacing:'0.5px'}}>2. SUBIR DOCUMENTO</label>
              <label style={{
                display:'flex', alignItems:'center', justifyContent:'center', gap:'10px',
                padding:'15px', border:'2px dashed #cbd5e1', borderRadius:'10px',
                cursor: uploading ? 'not-allowed' : 'pointer',
                background: '#f8fafc', color: '#64748b', transition: 'all 0.2s'
              }}>
                <input type="file" onChange={handleFileUpload} accept="application/pdf" disabled={uploading} style={{display:'none'}} />
                <span style={{fontSize:'1.5rem'}}>📂</span>
                <span style={{fontSize:'0.9rem', fontWeight:'500'}}>{uploading ? 'Procesando...' : (pdfName || 'Toca para elegir PDF')}</span>
              </label>
              {pdfName && !uploading && <p style={{fontSize:'0.75rem', color:'#15803d', marginTop:'6px', textAlign:'center'}}>✅ Archivo listo</p>}
            </div>
            <div style={{marginTop:'auto', paddingTop:'20px', display:'flex', flexDirection:'column', gap:'10px'}}>
               <button onClick={handleCreate} disabled={!persona} style={btnStyle}>Iniciar Análisis</button>
               <button onClick={handleLogout} style={{...btnStyle, background:'white', color:'#ef4444', border:'1px solid #ef4444'}}>Cerrar Sesión</button>
            </div>
          </div>
        )}

        {/* CHAT */}
        {showChat && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background:'white' }}>
            <div style={{padding:'16px', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:'10px', background:'white', boxShadow:'0 2px 4px rgba(0,0,0,0.02)', zIndex:10, justifyContent:'space-between'}}>
              <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                {isMobile && <button onClick={()=>setChatStarted(false)} style={{background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer'}}>⬅</button>}
                <div>
                  <strong style={{display:'block', color:'#1e293b'}}>{name}</strong>
                  <span style={{fontSize:'0.75rem', color:'#64748b'}}>Nexus AI v1.0</span>
                </div>
              </div>
              <div style={{display:'flex', gap:'15px', alignItems:'center'}}>
                  <span onClick={downloadReport} style={{fontSize:'0.85rem', color:'#2563eb', cursor:'pointer', fontWeight:'600', display:'flex', alignItems:'center', gap:'4px'}} title="Descargar Informe">📥 PDF</span>
                  <span onClick={() => { if(confirm("¿Borrar chat?")) setMessages([]) }} style={{fontSize:'1.2rem', cursor:'pointer'}} title="Limpiar Chat">🧹</span>
              </div>
            </div>

            <div style={{flex:1, padding:'20px', overflowY:'auto', background:'#f8fafc', display:'flex', flexDirection:'column', gap:'15px'}}>
              {messages.map((m,i)=>(
                <div key={i} style={{alignSelf: m.sender==='user'?'flex-end':'flex-start', maxWidth:'90%'}}>
                  <div style={{
                    padding:'12px 18px', borderRadius:'16px', 
                    background: m.sender==='user'?'#2563eb':'white', 
                    color: m.sender==='user'?'white':'#1e293b',
                    boxShadow:'0 2px 4px rgba(0,0,0,0.05)',
                    border: m.sender==='agent'?'1px solid #e2e8f0':'none',
                    position: 'relative'
                  }}>
                    {/* AQUÍ ESTABA EL ERROR: AHORA ESTÁ CORREGIDO 👇 */}
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{ strong: ({node, ...props}) => <span style={{fontWeight:'bold', color: m.sender==='user'?'#fde047':'inherit'}} {...props}/> }}
                    >
                      {m.text}
                    </ReactMarkdown>
                    
                    {m.sender === 'agent' && (
                      <button onClick={() => { navigator.clipboard.writeText(m.text); showToast("Copiado!", "success") }} 
                        style={{position: 'absolute', top: '8px', right: '8px', background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize:'0.9rem'}} title="Copiar">
                        📋
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef}/>
              {loading && !uploading && <div style={{padding:'10px', color:'#64748b', fontSize:'0.85rem', fontStyle:'italic'}}>Analizando...</div>}
            </div>

            <form onSubmit={handleSend} style={{padding:'15px', borderTop:'1px solid #e2e8f0', display:'flex', gap:'10px', background:'white', alignItems:'flex-end'}}>
              <textarea 
                value={inputMsg} 
                onChange={e=>setInputMsg(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) } }}
                placeholder="Escribe aquí... (Shift+Enter para saltar línea)" 
                rows={1}
                style={{flex:1, padding:'14px', borderRadius:'10px', border:'1px solid #e2e8f0', fontSize:'16px', outline:'none', resize:'none', minHeight:'50px', maxHeight:'120px', fontFamily:'inherit'}} 
              />
              <button disabled={loading} style={{...btnStyle, width:'auto', padding:'0 20px', borderRadius:'10px', height:'52px', display:'flex', alignItems:'center', justifyContent:'center'}}>➤</button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}







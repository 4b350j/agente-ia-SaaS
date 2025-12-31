import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm' // Importante: Para tablas estilo Excel
import { createClient } from '@supabase/supabase-js'
import { jsPDF } from 'jspdf'
import './App.css'

// 👇 MODO SEGURO (Variables de Entorno)
const API_URL = import.meta.env.VITE_API_URL
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// --- 1. CONFIGURACIÓN DE ROLES ---
const ROLES = [
  { 
    id: 'lawyer_general', name: 'Abogado General', icon: '⚖️', desc: 'Riesgos legales y cláusulas.',
    prompt: `Actúa como un abogado senior experto en derecho contractual. Analiza el documento buscando riesgos legales, ambigüedades y cláusulas abusivas. Usa tablas para listar los riesgos.` 
  },
  { 
    id: 'lawyer_labor', name: 'Laboralista', icon: '👷', desc: 'Contratos laborales y despidos.',
    prompt: `Actúa como un abogado laboralista experto. Analiza violaciones de derechos laborales, finiquitos y cláusulas abusivas.` 
  },
  { 
    id: 'auditor', name: 'Auditor Financiero', icon: '💰', desc: 'Errores numéricos y tablas.',
    prompt: `Actúa como un auditor financiero (Big 4). Busca incoherencias numéricas. Si encuentras datos, preséntalos SIEMPRE en una tabla comparativa.` 
  },
  { 
    id: 'summarizer', name: 'Resumidor', icon: '📝', desc: 'Resúmenes ejecutivos rápidos.',
    prompt: `Sintetiza la información clave, fechas e importes en una lista con viñetas. Ignora la paja.` 
  },
  {
    id: 'translator', name: 'Traductor Jurídico', icon: '🌍', desc: 'Jerga legal a lenguaje simple.',
    prompt: `Actúa como traductor jurado. Traduce o explica la jerga legal compleja en lenguaje sencillo.`
  }
]

// --- 2. SUGERENCIAS INTELIGENTES (CHIPS) ---
const SUGGESTIONS: Record<string, string[]> = {
  lawyer_general: ["🔍 Analizar riesgos clave", "🚩 ¿Hay cláusulas abusivas?", "📝 Resumir obligaciones"],
  lawyer_labor: ["💰 Calcular indemnización", "👷 Derechos de vacaciones", "🚫 Cláusulas de no competencia"],
  auditor: ["📊 Crear tabla de gastos", "📉 Detectar errores de suma", "🧾 Extraer totales por fecha"],
  summarizer: ["📄 Resumen en 1 página", "⚡ Puntos clave (Bullets)", "📅 Línea de tiempo de fechas"],
  translator: ["🇪🇸 Explicar en español simple", "🇬🇧 Traducir al Inglés", "📖 Definir términos latinos"]
}

// --- 3. HELPER DE CONEXIÓN ---
async function fetchWithRetry(url: string, options: any, retries = 3, backoff = 1000) {
  try {
    const res = await fetch(url, options)
    if (!res.ok) {
        if (res.status === 503 || res.status === 504) throw new Error("Servidor calentando motores...")
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
  
  const [name, setName] = useState('') // Rol seleccionado
  const [persona, setPersona] = useState('')
  const [chatStarted, setChatStarted] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const [inputMsg, setInputMsg] = useState('')
  const [loading, setLoading] = useState(false)
  
  const [pdfText, setPdfText] = useState('')
  const [pdfName, setPdfName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  
  const [notification, setNotification] = useState<{msg: string, type: 'error'|'success'|'info'} | null>(null)
  const [credits, setCredits] = useState(3)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // --- HELPERS ---
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
    // Protección contra cierre accidental
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (chatStarted && messages.length > 1) {
        e.preventDefault(); e.returnValue = ''; return ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Auth y Resize
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

  // Auto-scroll al fondo
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
    if (credits <= 0) { showToast(`🔒 Sin créditos. Vuelve mañana.`, 'error'); e.target.value = ''; return }
    
    setUploading(true)
    const formData = new FormData(); formData.append('file', file)
    try {
      const res = await fetchWithRetry(`${API_URL}/api/upload`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error("Error leyendo PDF")
      const data = await res.json()
      
      setPdfText(data.extracted_text); setPdfName(data.filename); useCredit()
      // Mensaje de sistema en el chat (opcional)
      setMessages(prev => [...prev, { sender: 'agent', text: `✅ **Documento recibido:** ${data.filename}\n\nHe extraído el contenido. Te quedan **${credits-1}** créditos.` }])
    } catch (err: any) { showToast(err.message, 'error') }
    setUploading(false)
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
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
      doc.setFontSize(10); doc.setTextColor(100); doc.text(`Doc: ${pdfName || 'N/A'}`, margin, y); y += 10
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
      doc.save(`Nexus_Informe_${new Date().toISOString().slice(0,10)}.pdf`)
      showToast("Informe descargado", "success")
    } catch (e) { showToast("Error al generar PDF", "error") }
  }

  // --- RENDERIZADO ---
  const showSidebar = !isMobile || (isMobile && !chatStarted)
  const showChat = !isMobile || (isMobile && chatStarted)
  
  const containerStyle: React.CSSProperties = { height: '100dvh', width: '100vw', background: '#f3f4f6', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: isMobile ? 0 : '20px', overflow: 'hidden' }
  const cardStyle: React.CSSProperties = { width: isMobile ? '100%' : '1000px', height: isMobile ? '100%' : '85vh', background: 'white', borderRadius: isMobile ? 0 : '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden' }
  const btnStyle: React.CSSProperties = { padding: '14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', width: '100%', fontSize: '1rem', cursor: 'pointer', fontWeight: '600' }

  // 1. PANTALLA DE LOGIN
  if (!session) return (
    <div style={containerStyle}>
      {notification && <div style={{position:'fixed', top:'20px', left:'50%', transform:'translateX(-50%)', background: notification.type==='error'?'#fee2e2':'#dcfce7', color: notification.type==='error'?'#dc2626':'#16a34a', padding:'10px 20px', borderRadius:'30px', boxShadow:'0 4px 12px rgba(0,0,0,0.1)', zIndex:1000, fontWeight:'bold'}}><span>{notification.type==='error'?'⚠️':'✅'}</span> {notification.msg}</div>}
      <div style={{...cardStyle, width:'400px', height:'auto', flexDirection:'column', padding:'40px', borderRadius:'12px', border:'1px solid #e5e7eb'}}>
        <h2 style={{color:'#2563eb', textAlign:'center', marginBottom:'20px'}}>🔐 Nexus AI</h2>
        <form onSubmit={handleAuth} style={{display:'flex', flexDirection:'column', gap:'15px'}}>
          <input type="email" placeholder="Email profesional" value={email} onChange={e=>setEmail(e.target.value)} style={{padding:'14px', borderRadius:'8px', border:'1px solid #e5e7eb', fontSize:'16px'}} required />
          <input type="password" placeholder="Contraseña" value={password} onChange={e=>setPassword(e.target.value)} style={{padding:'14px', borderRadius:'8px', border:'1px solid #e5e7eb', fontSize:'16px'}} required />
          <button style={btnStyle} disabled={loading}>{loading ? 'Conectando...' : (authMode === 'login' ? 'Entrar' : 'Crear Cuenta')}</button>
        </form>
        <p style={{textAlign:'center', marginTop:'15px', color:'#6b7280', fontSize:'0.85rem', cursor:'pointer'}} onClick={()=>setAuthMode(authMode==='login'?'register':'login')}>
          {authMode==='login' ? '¿Nuevo aquí? Regístrate gratis' : '¿Ya tienes cuenta? Inicia sesión'}
        </p>
      </div>
    </div>
  )

  // 2. APLICACIÓN PRINCIPAL
  return (
    <div style={containerStyle}>
      {/* Notificación Flotante (Toast) */}
      {notification && <div style={{position:'fixed', top:'20px', left:'50%', transform:'translateX(-50%)', background: notification.type==='error'?'#fee2e2':'#dcfce7', color: notification.type==='error'?'#dc2626':'#16a34a', padding:'10px 20px', borderRadius:'30px', boxShadow:'0 4px 12px rgba(0,0,0,0.1)', zIndex:1000, fontWeight:'bold', display:'flex', alignItems:'center', gap:'8px', animation:'slideIn 0.3s'}}><span>{notification.type==='error'?'⚠️':'✅'}</span> {notification.msg}</div>}

      <div style={cardStyle}>
        
        {/* SIDEBAR (Panel Izquierdo) */}
        {showSidebar && (
          <div style={{ width: isMobile ? '100%' : '350px', padding: '20px', borderRight: '1px solid #e5e7eb', background: '#f8fafc', overflowY: 'auto', display:'flex', flexDirection:'column' }}>
            <div style={{marginBottom:'25px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              {/* Título de marca actualizado */}
              <h2 style={{color:'#2563eb', fontSize:'1.3rem', fontWeight:'bold', margin:0}}>Nexus AI | Auditoría 🛡️</h2>
              <span style={{background: credits>0?'#dcfce7':'#fee2e2', color: credits>0?'#16a34a':'#dc2626', padding:'4px 10px', borderRadius:'20px', fontSize:'0.75rem', fontWeight:'bold'}}>💎 {credits}</span>
            </div>
            
            <div style={{display:'flex', flexDirection:'column', gap:'12px', marginBottom:'20px'}}>
              <label style={{fontSize:'0.7rem', color:'#64748b', fontWeight:'700', letterSpacing:'0.5px'}}>1. SELECCIONA EXPERTO</label>
              {ROLES.map(r => (
                <div key={r.id} onClick={()=>{setName(r.name); setPersona(r.prompt)}} style={{
                  padding:'12px', border: persona===r.prompt ? '2px solid #2563eb' : '1px solid #e2e8f0', 
                  borderRadius:'10px', background: persona===r.prompt ? '#eff6ff' : 'white', cursor:'pointer', transition: 'all 0.2s', display:'flex', alignItems:'center', gap:'10px'
                }}>
                  <span style={{fontSize:'1.5rem'}}>{r.icon}</span>
                  <div>
                    <div style={{fontWeight:'600', color:'#1e293b', fontSize:'0.9rem'}}>{r.name}</div>
                    <div style={{fontSize:'0.75rem', color:'#64748b'}}>{r.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            
            <div style={{marginBottom:'auto'}}>
              <label style={{fontSize:'0.7rem', color:'#64748b', fontWeight:'700', letterSpacing:'0.5px', marginBottom:'8px', display:'block'}}>2. SUBIR DOCUMENTO</label>
              <label style={{
                display:'flex', alignItems:'center', justifyContent:'center', gap:'10px',
                padding:'15px', border:'2px dashed #cbd5e1', borderRadius:'10px',
                cursor: uploading ? 'not-allowed' : 'pointer',
                background: '#f1f5f9', color: '#64748b', transition: 'all 0.2s',
                opacity: uploading ? 0.6 : 1
              }}>
                <input type="file" onChange={handleFileUpload} accept="application/pdf" disabled={uploading} style={{display:'none'}} />
                <span style={{fontSize:'1.2rem'}}>📂</span>
                <span style={{fontSize:'0.85rem', fontWeight:'500'}}>{uploading ? 'Procesando...' : (pdfName || 'Subir PDF')}</span>
              </label>
              {pdfName && !uploading && <p style={{fontSize:'0.75rem', color:'#15803d', marginTop:'6px', textAlign:'center', fontWeight:'600'}}>✅ Archivo listo</p>}
            </div>

            <div style={{marginTop:'20px', display:'flex', flexDirection:'column', gap:'10px'}}>
               <button onClick={handleCreate} disabled={!persona} style={btnStyle}>Iniciar Análisis</button>
               <button onClick={handleLogout} style={{...btnStyle, background:'transparent', color:'#ef4444', border:'1px solid #ef4444', fontSize:'0.9rem'}}>Cerrar Sesión</button>
            </div>
          </div>
        )}

        {/* CHAT AREA (Panel Derecho) */}
        {showChat && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background:'white' }}>
            
            {/* Header del Chat */}
            <div style={{padding:'15px 20px', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between', background:'white', zIndex:10}}>
              <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                {isMobile && <button onClick={()=>setChatStarted(false)} style={{background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer'}}>⬅</button>}
                <div>
                  <strong style={{display:'block', color:'#1e293b', fontSize:'1rem'}}>{name}</strong>
                  <span style={{fontSize:'0.75rem', color:'#64748b'}}>Nexus AI | Auditoría</span>
                </div>
              </div>
              <div style={{display:'flex', gap:'15px'}}>
                  <button onClick={downloadReport} style={{background:'none', border:'none', fontSize:'0.85rem', color:'#2563eb', cursor:'pointer', fontWeight:'600'}} title="Descargar Informe">📥 PDF</button>
                  <button onClick={() => { if(confirm("¿Borrar historial de chat?")) setMessages([]) }} style={{background:'none', border:'none', fontSize:'1.2rem', cursor:'pointer'}} title="Limpiar">🧹</button>
              </div>
            </div>

            {/* Zona de Mensajes */}
            <div style={{flex:1, padding:'20px', overflowY:'auto', background:'#f8fafc', display:'flex', flexDirection:'column'}}>
              
              {/* EMPTY STATE: Si no hay mensajes */}
              {messages.length === 0 && (
                <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', color:'#94a3b8', textAlign:'center', opacity:0.8}}>
                  <div style={{fontSize:'3rem', marginBottom:'15px', filter:'grayscale(100%)'}}>{ROLES.find(r=>r.name===name)?.icon}</div>
                  <h3 style={{color:'#475569', marginBottom:'5px', fontWeight:'600'}}>Hola, soy tu {name}</h3>
                  <p style={{fontSize:'0.9rem', maxWidth:'300px'}}>Sube un documento o hazme una pregunta para empezar el análisis.</p>
                </div>
              )}

              {/* LISTA DE MENSAJES CON DISEÑO PRO (Avatares fuera) */}
              {messages.map((m, i) => {
                const isUser = m.sender === 'user';
                const avatarIcon = isUser ? '👤' : (ROLES.find(r => r.name === name)?.icon || '🤖');
                return (
                  <div key={i} className={`message-row ${isUser ? 'user' : 'agent'}`}>
                    {/* Avatar Externo */}
                    <div className="avatar" style={{background: isUser ? '#dbeafe' : 'white', border: isUser?'none':'1px solid #e2e8f0'}}>
                      {avatarIcon}
                    </div>
                    
                    <div style={{display:'flex', flexDirection:'column', alignItems: isUser ? 'flex-end' : 'flex-start', maxWidth:'85%'}}>
                      <span className="sender-name" style={{textAlign: isUser ? 'right' : 'left'}}>{isUser ? 'Tú' : name}</span>
                      
                      <div className={`bubble ${isUser ? 'user' : 'agent'}`}>
                        {/* Renderizado Markdown con Soporte para Tablas */}
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ 
                            strong: ({node, ...props}) => <span style={{fontWeight:'700', color: isUser?'#fde047':'#1e293b'}} {...props}/>,
                            table: ({node, ...props}) => <div style={{overflowX:'auto'}}><table {...props}/></div> 
                        }}>
                          {m.text}
                        </ReactMarkdown>

                        {/* Botón copiar (Solo visible en mensajes del Agente) */}
                        {!isUser && (
                          <div style={{marginTop:'12px', paddingTop:'8px', borderTop:'1px solid #f1f5f9', display:'flex', justifyContent:'flex-end'}}>
                             <button onClick={() => { navigator.clipboard.writeText(m.text); showToast("Texto copiado", "success") }}
                               style={{background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:'0.75rem', display:'flex', alignItems:'center', gap:'4px', fontWeight:'600'}}>
                               📋 COPIAR
                             </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Indicador de Escritura Animado (Typing Indicator) */}
              {loading && !uploading && (
                <div style={{display:'flex', gap:'10px', marginBottom:'20px', animation:'slideIn 0.3s'}}>
                   <div className="avatar" style={{background:'white', border:'1px solid #e2e8f0'}}>{ROLES.find(r => r.name === name)?.icon}</div>
                   <div className="bubble agent" style={{padding:'12px 18px', width:'fit-content'}}>
                      <div className="typing-indicator"><span></span><span></span><span></span></div>
                   </div>
                </div>
              )}
              <div ref={chatEndRef}/>
            </div>

            {/* Zona de Input y Chips */}
            <div style={{background:'white', borderTop:'1px solid #e2e8f0'}}>
              
              {/* CHIPS DE SUGERENCIAS (Solo si no está cargando y el chat es corto) */}
              {!loading && messages.length < 10 && (
                <div style={{display:'flex', gap:'8px', padding:'12px 20px', overflowX:'auto', scrollbarWidth:'none'}}>
                  {SUGGESTIONS[ROLES.find(r=>r.name===name)?.id || 'lawyer_general']?.map((sug, i) => (
                    <button key={i} className="suggestion-chip" onClick={() => setInputMsg(sug)}>
                      {sug}
                    </button>
                  ))}
                </div>
              )}

              {/* Formulario de Envío (Textarea inteligente) */}
              <form onSubmit={handleSend} style={{padding:'10px 20px 20px', display:'flex', gap:'12px', alignItems:'flex-end'}}>
                <textarea 
                  value={inputMsg} 
                  onChange={e=>setInputMsg(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) } }}
                  placeholder="Escribe aquí... (Shift+Enter para salto)" 
                  rows={1}
                  style={{flex:1, padding:'14px', borderRadius:'12px', border:'1px solid #e2e8f0', fontSize:'16px', outline:'none', resize:'none', minHeight:'50px', maxHeight:'120px', fontFamily:'inherit', background:'#f8fafc', color:'#1e293b'}} 
                />
                <button disabled={loading} style={{...btnStyle, width:'50px', height:'50px', borderRadius:'12px', padding:0, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 4px 6px -1px rgba(37, 99, 235, 0.2)'}}>
                  ➤
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}






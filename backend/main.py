import os
import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
from pypdf import PdfReader
from io import BytesIO

# Configuración básica
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuración de Gemini (API KEY)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("⚠️ ADVERTENCIA: No veo la GEMINI_API_KEY. Asegúrate de ponerla en Render.")

try:
    genai.configure(api_key=GEMINI_API_KEY)
    # Usamos el modelo 2.5 Flash (o 1.5 Flash si prefieres)
    model = genai.GenerativeModel('gemini-2.5-flash') 
except Exception as e:
    print(f"Error configurando Gemini: {e}")

# Modelos de datos
class AgentConfig(BaseModel):
    name: str
    persona: str

class ChatRequest(BaseModel):
    name: str
    persona: str
    history: list
    message: str
    # Campo opcional para el contexto del documento
    context: str = "" 

@app.get("/")
def home():
    return {"status": "Backend Operativo v2.0 (Con Lector PDF)"}

# 1. Crear Agente
@app.post("/api/agents")
def create_agent(config: AgentConfig):
    try:
        prompt = f"Eres {config.name}. Tu personalidad es: {config.persona}. Preséntate brevemente."
        response = model.generate_content(prompt)
        return {"welcome_msg": response.text}
    except Exception as e:
        # Fallback por si Google falla
        return {"welcome_msg": f"Hola, soy {config.name}. Sistema online (Modo Offline)."}

# 2. Endpoint NUEVO: Subir y Leer PDF 📂
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")
    
    try:
        # Leemos el archivo en memoria
        content = await file.read()
        pdf_file = BytesIO(content)
        reader = PdfReader(pdf_file)
        
        text = ""
        # Extraemos texto página a página
        for page in reader.pages:
            text += page.extract_text() + "\n"
            
        # Devolvemos el texto extraído para que el Frontend lo guarde
        # (Limitamos a 100k caracteres para no saturar)
        return {"extracted_text": text[:100000], "filename": file.filename}
        
    except Exception as e:
        print(f"Error leyendo PDF: {e}")
        raise HTTPException(status_code=500, detail="No se pudo leer el documento PDF")

# 3. Chat Inteligente (Ahora acepta contexto de documentos)
@app.post("/api/chat")
def chat(request: ChatRequest):
    try:
        # Construimos el historial para Gemini
        gemini_history = []
        
        # Si hay documento, lo inyectamos como "Instrucción del Sistema"
        system_instruction = f"Eres {request.name}. Actúa como: {request.persona}."
        if request.context:
            system_instruction += f"\n\nCONTEXTO IMPORTANTE (DOCUMENTO SUBIDO):\n{request.context}\n\nResponde basándote en este contexto si es relevante."

        # Simulamos el mensaje de sistema en el primer turno (Gemini no tiene 'system' role en chat history simple)
        gemini_history.append({"role": "user", "parts": [system_instruction]})
        gemini_history.append({"role": "model", "parts": ["Entendido. Usaré ese contexto."]})

        # Añadimos la conversación real
        for msg in request.history:
            role = "user" if msg['sender'] == 'user' else "model"
            gemini_history.append({"role": role, "parts": [msg['text']]})
            
        # Añadimos el mensaje actual
        chat_session = model.start_chat(history=gemini_history)
        response = chat_session.send_message(request.message)
        
        return {"response": response.text}
    except Exception as e:
        print(f"Error en chat: {e}")
        return {"response": "Lo siento, tuve un error procesando tu solicitud."}





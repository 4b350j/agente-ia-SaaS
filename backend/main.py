import os
import logging
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
from pypdf import PdfReader
from io import BytesIO

# Configuración de Logs (Para ver errores en la consola de Render)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logger.warning("⚠️ FALTAN LAS CLAVES DE API")

try:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.5-flash') 
except Exception as e:
    logger.error(f"Error configurando Gemini: {e}")

class AgentConfig(BaseModel):
    name: str
    persona: str

class ChatRequest(BaseModel):
    name: str
    persona: str
    history: list
    message: str
    context: str = "" 

@app.get("/")
def home():
    return {"status": "Backend Blindado v3.0"}

@app.post("/api/agents")
def create_agent(config: AgentConfig):
    try:
        prompt = f"Eres {config.name}. Tu personalidad es: {config.persona}. Preséntate brevemente en una frase."
        response = model.generate_content(prompt)
        return {"welcome_msg": response.text}
    except Exception as e:
        logger.error(f"Fallo en Gemini: {e}")
        # Fallback seguro para que la app no se rompa
        return {"welcome_msg": f"Hola, soy {config.name}. Estoy listo para ayudarte."}

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    # 1. BLINDAJE: Verificar extensión
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF.")
    
    # 2. BLINDAJE: Verificar tamaño (Max 5MB para plan gratis)
    # Nota: Render free tiene poca RAM. Leer archivos grandes puede matarlo.
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    
    if size > 5 * 1024 * 1024: # 5 MB limit
        raise HTTPException(status_code=413, detail="El archivo es demasiado grande (Máx 5MB).")

    try:
        content = await file.read()
        pdf_file = BytesIO(content)
        reader = PdfReader(pdf_file)
        
        text = ""
        for i, page in enumerate(reader.pages):
            extracted = page.extract_text()
            if extracted:
                text += extracted + "\n"
        
        # 3. BLINDAJE: PDF vacío o escaneado
        if not text.strip():
            return {"extracted_text": "", "filename": file.filename, "warning": "No pude leer texto. Puede que sea un PDF escaneado (imagen)."}

        # Limitamos caracteres para no romper el contexto de Gemini
        return {"extracted_text": text[:50000], "filename": file.filename}
        
    except Exception as e:
        logger.error(f"Error leyendo PDF: {e}")
        raise HTTPException(status_code=500, detail="El archivo PDF está dañado o protegido.")

@app.post("/api/chat")
def chat(request: ChatRequest):
    try:
        gemini_history = []
        
        # Instrucción del sistema
        system_instruction = f"Eres {request.name}. Actúa como: {request.persona}."
        if request.context:
            system_instruction += f"\n\nCONTEXTO DEL DOCUMENTO:\n{request.context[:30000]}\n\nUsa este contexto para responder."

        gemini_history.append({"role": "user", "parts": [system_instruction]})
        gemini_history.append({"role": "model", "parts": ["Entendido."]})

        # Añadimos historial (filtrando mensajes vacíos para evitar errores)
        for msg in request.history:
            if msg.get('text') and msg['text'].strip():
                role = "user" if msg['sender'] == 'user' else "model"
                gemini_history.append({"role": role, "parts": [msg['text']]})
            
        chat_session = model.start_chat(history=gemini_history)
        response = chat_session.send_message(request.message)
        
        return {"response": response.text}
    except Exception as e:
        logger.error(f"Error chat: {e}")
        return {"response": "Lo siento, hubo un error de conexión con mi cerebro. Por favor intenta de nuevo."}





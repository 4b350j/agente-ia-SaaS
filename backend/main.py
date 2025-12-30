import os
import uvicorn
import sentry_sdk
import pdfplumber  # <--- NUEVA LIBRERÍA DE LECTURA
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import google.generativeai as genai
from dotenv import load_dotenv

# --- 1. CONFIGURACIÓN INICIAL ---
load_dotenv()

# --- 2. CONFIGURAR GEMINI (IA) ---
GENAI_API_KEY = os.getenv("GENAI_API_KEY")
if not GENAI_API_KEY:
    print("⚠️ ADVERTENCIA: No se encontró GENAI_API_KEY en las variables de entorno.")
else:
    genai.configure(api_key=GENAI_API_KEY)

# --- 3. INICIALIZAR SENTRY ---
# Asegúrate de que tu DSN real esté aquí
SENTRY_DSN = "https://dd97fed17060df4fc28f0bedbbedcc2c@o4510614400532480.ingest.de.sentry.io/4510614431596624" 

if SENTRY_DSN and "example" not in SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )
else:
    print("ℹ️ Sentry no iniciado (DSN no configurado o es de ejemplo).")

# --- 4. APP FASTAPI ---
app = FastAPI()

# Configuración CORS (Permitir que el Frontend hable con el Backend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción, cambia esto por tu dominio de Vercel
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODELOS DE DATOS ---
class AgentConfig(BaseModel):
    name: str
    persona: str

class ChatMessage(BaseModel):
    sender: str
    text: str

class ChatRequest(BaseModel):
    name: str
    persona: str
    history: List[ChatMessage]
    message: str
    context: Optional[str] = ""

# --- RUTAS (ENDPOINTS) ---

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Nexus AI Backend Running 🚀"}

@app.get("/sentry-debug")
async def trigger_error():
    division_by_zero = 1 / 0
    return {"result": division_by_zero}

# --- 5. SUBIDA DE ARCHIVOS MEJORADA (PDFPLUMBER) ---
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    temp_filename = f"temp_{file.filename}"
    
    try:
        # 1. Guardar el archivo temporalmente
        with open(temp_filename, "wb") as buffer:
            buffer.write(await file.read())

        extracted_text = ""
        
        # 2. Leer con pdfplumber (Mejor para tablas y columnas)
        with pdfplumber.open(temp_filename) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    extracted_text += text + "\n"

        # 3. Limpieza: Borrar archivo temporal
        if os.path.exists(temp_filename):
            os.remove(temp_filename)

        # 4. Validar si se extrajo texto
        if not extracted_text.strip():
            return JSONResponse(content={
                "filename": file.filename,
                "extracted_text": "",
                "warning": "El documento parece ser una imagen escaneada o está vacío. La IA podría no leerlo bien."
            })

        return {
            "filename": file.filename, 
            "extracted_text": extracted_text
        }

    except Exception as e:
        # Si falla, aseguramos borrar el temporal y avisamos a Sentry
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
        sentry_sdk.capture_exception(e)
        print(f"❌ Error procesando PDF: {e}")
        raise HTTPException(status_code=500, detail=f"Error procesando el archivo: {str(e)}")

# --- 6. CONFIGURACIÓN DE AGENTE ---
@app.post("/api/agents")
def configure_agent(config: AgentConfig):
    return {
        "status": "configured",
        "agent": config.name,
        "welcome_msg": f"Hola, soy {config.name}. {config.persona.split('.')[0]}."
    }

# --- 7. CHAT CON LA IA ---
@app.post("/api/chat")
async def chat_agent(request: ChatRequest):
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        
        # Construir el Prompt
        prompt_parts = [
            f"Instrucción del Sistema: {request.persona}",
            "---",
            f"Contexto del Documento (PDF): {request.context[:50000] if request.context else 'Ninguno'}", # Limitamos a 50k caracteres por seguridad
            "---",
            "Historial de conversación:"
        ]
        
        for msg in request.history:
            role = "user" if msg.sender == "user" else "model"
            prompt_parts.append(f"{role}: {msg.text}")
            
        prompt_parts.append(f"user: {request.message}")
        
        full_prompt = "\n".join(prompt_parts)
        
        response = model.generate_content(full_prompt)
        
        return {"response": response.text}

    except Exception as e:
        sentry_sdk.capture_exception(e)
        print(f"❌ Error en Chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)












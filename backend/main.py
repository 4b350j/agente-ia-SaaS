from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai

# --- CONFIGURACIÓN ---
# 👇 ¡PEGA TU CLAVE AQUÍ DENTRO DE LAS COMILLAS! 👇
API_KEY = "AIzaSyDKm8APZ4kDsVPiQ8qosIuIWde2pH10tlQ"
# ---------------------

genai.configure(api_key=API_KEY)

# Configuración de seguridad para evitar bloqueos (Error 500)
safety_settings = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]

# Usamos este modelo que aparecía en tu lista y suele ser estable
model = genai.GenerativeModel('gemini-flash-latest', safety_settings=safety_settings)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class AgentRequest(BaseModel):
    name: str
    persona: str

class ChatRequest(BaseModel):
    name: str
    persona: str
    history: list
    message: str

@app.post("/api/agents")
async def create_agent(agent: AgentRequest):
    print(f"🎭 Creando personaje: {agent.name}")
    try:
        prompt = f"Eres un actor experto. Vas a interpretar a {agent.name}. Tu personalidad es: {agent.persona}. Por favor, preséntate brevemente ante mí (el usuario) metido en el personaje. Sé interesante."
        response = model.generate_content(prompt)
        return {"welcome_msg": response.text}
    except Exception as e:
        print(f"❌ Error generando: {e}")
        return {"welcome_msg": "Lo siento, tengo problemas de conexión. ¿Podemos intentarlo de nuevo?"}

@app.post("/api/chat")
async def chat_agent(request: ChatRequest):
    print(f"💬 Mensaje recibido para {request.name}")
    try:
        chat_history = []
        chat_history.append({"role": "user", "parts": [f"Instrucciones: Eres {request.name}. Personalidad: {request.persona}. Mantén el personaje siempre."]})
        chat_history.append({"role": "model", "parts": ["Entendido, permaneceré en el personaje."]})
        
        for msg in request.history:
            role = "user" if msg['sender'] == 'user' else "model"
            chat_history.append({"role": role, "parts": [msg['text']]})
            
        chat = model.start_chat(history=chat_history)
        response = chat.send_message(request.message)
        return {"response": response.text}
        
    except Exception as e:
        print(f"❌ Error en chat: {e}")
        return {"response": "*tos* *tos* (Error técnico en el servidor Python. Mira la terminal para más detalles)."}
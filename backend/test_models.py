import google.generativeai as genai

# --- ⚠️ PON TU CLAVE AQUÍ OTRA VEZ ⚠️ ---
API_KEY = "AIzaSyDKm8APZ4kDsVPiQ8qosIuIWde2pH10tlQ" 
# ----------------------------------------

genai.configure(api_key=API_KEY)

print("🔍 Buscando modelos disponibles en tu cuenta...")
print("-" * 40)

try:
    for m in genai.list_models():
        # Solo queremos ver los que sirven para generar texto (generateContent)
        if 'generateContent' in m.supported_generation_methods:
            print(f"✅ ENCONTRADO: {m.name}")
except Exception as e:
    print(f"❌ Error al listar modelos: {e}")

print("-" * 40)
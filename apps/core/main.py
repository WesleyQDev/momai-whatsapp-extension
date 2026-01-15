from typing import Union
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel # 1. Importe o BaseModel

app = FastAPI()

# Sua config de CORS está perfeita
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Defina o esquema do que você espera receber
class ChatMessage(BaseModel):
    content: str

@app.post("/chat") # Mudando de /ping para /chat para fazer sentido
def handle_chat(message: ChatMessage):
    # O FastAPI já valida se 'message' tem um 'content' que é string
    reply = f"MomAI recebeu: {message.content}"
    return {"reply": reply}

@app.get("/status")
def get_status():
    return {"status": "online", "version": "1.0.0"}
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from datetime import datetime
import os

Base = declarative_base()

class Reminder(Base):
    __tablename__ = 'reminders'
    
    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    content = Column(String)
    scheduled_time = Column(DateTime, nullable=False)
    repeat_interval = Column(String)  # 'minutes', 'hours', 'days', 'weeks', 'months' or None
    repeat_value = Column(Integer)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now())

class Settings(Base):
    __tablename__ = 'settings'

    id = Column(Integer, primary_key=True)
    # Perfil
    user_name = Column(String, default="Senhor")
    assistant_persona = Column(String, default="You are MomAI, a helpful and professional virtual assistant. Always respond in Brazilian Portuguese (PT-BR).")
    
    # IA Provider
    ai_provider = Column(String, default="local") # local, groq, gemini
    ai_model = Column(String, default="default")
    api_keys = Column(String, default="{}") # JSON string {"groq": "", "gemini": ""}
    local_backend = Column(String, default="auto") # auto, cuda, vulkan, cpu
    
    # Audio
    tts_voice = Column(String, default="pt-BR-FranciscaNeural")
    tts_enabled = Column(Boolean, default=False)
    wake_word_enabled = Column(Boolean, default=True)
    wake_word_sensitivity = Column(Integer, default=5) # 1-10

class Message(Base):
    __tablename__ = 'messages'
    
    id = Column(Integer, primary_key=True)
    thread_id = Column(String, index=True)
    role = Column(String) # 'user' or 'assistant'
    content = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now())

# Database setup
DB_PATH = os.path.join(os.path.dirname(__file__), "momai.db")
engine = create_engine(f"sqlite:///{DB_PATH}")
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

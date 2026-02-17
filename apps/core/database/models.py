from sqlalchemy import Column, Integer, String, Boolean, DateTime, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from datetime import datetime
import os

Base = declarative_base()


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    content = Column(String)
    scheduled_time = Column(DateTime, nullable=False)
    repeat_interval = Column(
        String
    )  # 'minutes', 'hours', 'days', 'weeks', 'months' or None
    repeat_value = Column(Integer)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now())


class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True)
    # Perfil
    user_name = Column(String, default="Senhor")
    assistant_persona = Column(
        String,
        default="You are MomAI, a professional and efficient local AI assistant. Always maintain a direct assistant-to-owner relationship and avoid over-nurturing behavior. Respond in Brazilian Portuguese (PT-BR).",
    )

    # IA Provider
    ai_provider = Column(String, default="local")  # local, groq, gemini
    ai_model = Column(String, default="Qwen 3 4B Instruct")
    api_keys = Column(String, default="{}")  # JSON string {"groq": "", "gemini": ""}
    local_backend = Column(String, default="auto")  # auto, cuda, vulkan, cpu

    # Audio
    tts_voice = Column(String, default="pf_dora")
    tts_enabled = Column(Boolean, default=False)
    wake_word_enabled = Column(Boolean, default=True)
    wake_word_sensitivity = Column(Integer, default=5)  # 1-10

    # UI/Locale
    locale = Column(String, default="pt-BR")

    # Onboarding/Tutorial
    onboarding_completed = Column(Boolean, default=False)
    tutorial_completed = Column(Boolean, default=False)

    # Daily Briefing
    daily_briefing_enabled = Column(Boolean, default=False)
    last_briefing_date = Column(String, default=None)  # YYYY-MM-DD


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True)
    thread_id = Column(String, index=True)
    role = Column(String)  # 'user' or 'assistant'
    content = Column(String)
    activities = Column(String, default=None)  # JSON array of activity strings
    graph_data = Column(String, default=None)  # JSON object for generated interfaces
    sources = Column(
        String, default=None
    )  # JSON array of source objects with url, title, snippet
    snippets = Column(String, default=None)  # JSON array of snippet objects
    cards = Column(String, default=None)  # JSON array of card objects
    created_at = Column(DateTime, default=lambda: datetime.now())


class ConversationSummary(Base):
    __tablename__ = "conversation_summaries"

    thread_id = Column(String, primary_key=True)
    content = Column(String, nullable=False)
    last_message_id = Column(Integer, default=0)
    updated_at = Column(DateTime, default=lambda: datetime.now())


class ExternalNote(Base):
    __tablename__ = "external_notes"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    path = Column(String, nullable=False)
    source = Column(String, default="local")
    last_indexed_at = Column(DateTime, default=None)
    created_at = Column(DateTime, default=lambda: datetime.now())
    updated_at = Column(DateTime, default=lambda: datetime.now())


class Extension(Base):
    __tablename__ = "extensions"

    id = Column(String, primary_key=True)
    is_enabled = Column(Boolean, default=True)
    is_builtin = Column(Boolean, default=False)
    installed_at = Column(DateTime, default=lambda: datetime.now())


class GamingApp(Base):
    """Apps that, when opened, activate the resource saving mode."""

    __tablename__ = "gaming_apps"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    executable = Column(String, nullable=False, unique=True)  # ex: 'rdr2.exe'
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now())


# Database setup
data_dir = os.environ.get("MOMAI_DATA_DIR")
if data_dir:
    os.makedirs(data_dir, exist_ok=True)
    DB_PATH = os.path.join(data_dir, "momai.db")
else:
    # Points to the core folder (one level up from database/)
    DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "momai.db")
engine = create_engine(f"sqlite:///{DB_PATH}")
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    Base.metadata.create_all(bind=engine)

    # Lightweight migration for new Settings columns
    with engine.connect() as conn:
        res = conn.execute(text("PRAGMA table_info(settings)"))
        cols = {row[1] for row in res.fetchall()}

        if "locale" not in cols:
            conn.execute(
                text("ALTER TABLE settings ADD COLUMN locale TEXT DEFAULT 'pt-BR'")
            )
        if "min_interface_chars" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE settings ADD COLUMN min_interface_chars INTEGER DEFAULT 240"
                )
            )
        if "prebuffer_chars" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE settings ADD COLUMN prebuffer_chars INTEGER DEFAULT 0"
                )
            )
        if "onboarding_completed" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE settings ADD COLUMN onboarding_completed BOOLEAN DEFAULT 0"
                )
            )

        # Migration for messages.sources column
        res = conn.execute(text("PRAGMA table_info(messages)"))
        msg_cols = {row[1] for row in res.fetchall()}
        if "sources" not in msg_cols:
            conn.execute(
                text("ALTER TABLE messages ADD COLUMN sources TEXT DEFAULT NULL")
            )
        if "snippets" not in msg_cols:
            conn.execute(
                text("ALTER TABLE messages ADD COLUMN snippets TEXT DEFAULT NULL")
            )
        if "cards" not in msg_cols:
            conn.execute(
                text("ALTER TABLE messages ADD COLUMN cards TEXT DEFAULT NULL")
            )
        conn.commit()

        if "tutorial_completed" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE settings ADD COLUMN tutorial_completed BOOLEAN DEFAULT 0"
                )
            )
        if "daily_briefing_enabled" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE settings ADD COLUMN daily_briefing_enabled BOOLEAN DEFAULT 0"
                )
            )
        if "last_briefing_date" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE settings ADD COLUMN last_briefing_date TEXT DEFAULT NULL"
                )
            )

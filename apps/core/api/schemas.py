from datetime import datetime

from pydantic import BaseModel


class ChatMessage(BaseModel):
    content: str
    thread_id: str = "default"


class ModeChange(BaseModel):
    mode: str


class ReminderCreate(BaseModel):
    title: str
    content: str | None = None
    scheduled_time: datetime
    repeat_interval: str | None = None
    repeat_value: int | None = None


class ReminderUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    scheduled_time: datetime | None = None
    repeat_interval: str | None = None
    repeat_value: int | None = None
    is_active: bool | None = None


class SettingsUpdate(BaseModel):
    user_name: str | None = None
    assistant_persona: str | None = None
    ai_provider: str | None = None
    ai_model: str | None = None
    local_backend: str | None = None
    api_keys: dict | None = None
    tts_voice: str | None = None
    tts_enabled: bool | None = None
    wake_word_enabled: bool | None = None
    wake_word_sensitivity: int | None = None
    locale: str | None = None
    onboarding_completed: bool | None = None
    tutorial_completed: bool | None = None
    daily_briefing_enabled: bool | None = None


class ExtensionToggle(BaseModel):
    id: str
    enabled: bool


class GamingAppCreate(BaseModel):
    name: str
    executable: str


class NoteCreate(BaseModel):
    title: str
    content: str = ""


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None


class NoteImportItem(BaseModel):
    name: str
    content: str


class NotesImport(BaseModel):
    files: list[NoteImportItem]


class MemorySearch(BaseModel):
    query: str
    limit: int | None = None


class InstallRequest(BaseModel):
    backend: str | None = None


class InstallExtensionRequest(BaseModel):
    id: str
    download_url: str


class ExtensionActionRequest(BaseModel):
    action: str
    payload: dict | None = None

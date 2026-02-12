import asyncio
import logging
from datetime import datetime, date
from sqlalchemy.orm import Session
from database.models import SessionLocal, Settings, Reminder
import app_state

logger = logging.getLogger("momai.briefing")

async def check_and_run_daily_briefing():
    """
    Checks if a daily briefing is due and runs it if necessary.
    """
    db = SessionLocal()
    try:
        settings = db.query(Settings).first()
        if not settings or not settings.daily_briefing_enabled:
            return

        if not settings.tts_enabled:
            return

        today_str = date.today().isoformat() # YYYY-MM-DD
        
        if settings.last_briefing_date == today_str:
            # Already briefing today
            return

        logger.info(f"[Briefing] Starting daily briefing for {today_str}")
        
        # 1. Generate the briefing text
        briefing_text = await generate_briefing_text(db, settings.user_name)
        
        # 2. Update the last briefing date
        settings.last_briefing_date = today_str
        db.commit()

        # 3. Schedule the speech (wait for system ready)
        asyncio.create_task(run_briefing_speech(briefing_text))
        
    except Exception as e:
        logger.error(f"[Briefing] Error during briefing check: {e}")
    finally:
        db.close()

async def generate_briefing_text(db: Session, user_name: str) -> str:
    """Generates the speech text for the briefing."""
    now = datetime.now()
    
    # Day info
    # weekday_map = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"]
    # month_map = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
    
    # locale = Settings().locale or "pt-BR"
    # For simplicity and brevity as requested for TTS:
    days_map = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]
    pt_months = {
        "1": "janeiro", "2": "fevereiro", "3": "março", "4": "abril", "5": "maio", "6": "junho",
        "7": "julho", "8": "agosto", "9": "setembro", "10": "outubro", "11": "novembro", "12": "dezembro"
    }
    
    day_sent = f"Bom dia, {user_name}. Hoje é {days_map[now.weekday()]}, dia {now.day} de {pt_months.get(str(now.month))}."
    
    # Next activity
    next_reminder = db.query(Reminder).filter(
        Reminder.is_active == True,
        Reminder.scheduled_time > now
    ).order_by(Reminder.scheduled_time.asc()).first()
    
    agenda_sent = ""
    if next_reminder:
        diff = next_reminder.scheduled_time - now
        hours = diff.seconds // 3600
        minutes = (diff.seconds % 3600) // 60
        
        time_str = ""
        if diff.days > 0:
            time_str = f"{diff.days} dia{'s' if diff.days > 1 else ''}"
        elif hours > 0:
            time_str = f"{hours} hora{'s' if hours > 1 else ''}"
            if minutes > 0:
                time_str += f" e {minutes} minuto{'s' if minutes > 1 else ''}"
        else:
            time_str = f"{minutes} minuto{'s' if minutes > 1 else ''}"
            
        agenda_sent = f" Sua próxima atividade é \"{next_reminder.title}\", em {time_str}."
    else:
        agenda_sent = " Você não tem atividades agendadas para as próximas horas."
        
    return f"{day_sent}{agenda_sent}"

async def run_briefing_speech(text: str):
    """Waits for various components to be ready and then speaks."""
    # Wait for TTS to be initialized
    for _ in range(30): # Wait up to 30 seconds
        if app_state.tts and app_state.tts.tts:
             break
        await asyncio.sleep(1)
    
    if app_state.tts and app_state.tts.tts:
        logger.info(f"[Briefing] Speaking: {text}")
        app_state.tts.tts.speak(text)

import asyncio

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.deps import get_db, require_ai_loaded
from api.schemas import ReminderCreate, ReminderUpdate
from database.models import Reminder
import app_state

router = APIRouter()


@router.get("/reminders")
@require_ai_loaded
async def list_reminders_route():
    reminders = await asyncio.to_thread(app_state.reminder_manager.list_reminders)
    return [
        {
            "id": reminder.id,
            "title": reminder.title,
            "content": reminder.content,
            "scheduled_time": reminder.scheduled_time.isoformat(),
            "repeat_interval": reminder.repeat_interval,
            "repeat_value": reminder.repeat_value,
            "is_active": reminder.is_active
        }
        for reminder in reminders
    ]


@router.get("/reminders/active")
async def list_active_reminders(db: Session = Depends(get_db)):
    reminders = (
        db.query(Reminder)
        .filter(Reminder.is_active == True)
        .order_by(Reminder.scheduled_time.asc())
        .limit(5)
        .all()
    )
    return [
        {
            "id": reminder.id,
            "title": reminder.title,
            "scheduled_time": reminder.scheduled_time.isoformat()
        }
        for reminder in reminders
    ]


@router.post("/reminders")
@require_ai_loaded
async def create_reminder_route(data: ReminderCreate):
    return await asyncio.to_thread(
        app_state.reminder_manager.add_reminder,
        data.title,
        data.content,
        data.scheduled_time,
        data.repeat_interval,
        data.repeat_value
    )


@router.delete("/reminders/{reminder_id}")
@require_ai_loaded
async def delete_reminder_route(reminder_id: int):
    await asyncio.to_thread(app_state.reminder_manager.delete_reminder, reminder_id)
    return {"status": "deleted"}


@router.patch("/reminders/{reminder_id}")
@require_ai_loaded
async def update_reminder_route(reminder_id: int, data: ReminderUpdate):
    updated = await asyncio.to_thread(
        app_state.reminder_manager.update_reminder,
        reminder_id,
        **data.model_dump(exclude_unset=True)
    )
    if not updated:
        return {"status": "error", "message": "Reminder not found"}
    return updated

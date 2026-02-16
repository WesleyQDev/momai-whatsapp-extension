from langchain_core.tools import tool
from pydantic import BaseModel, Field
from typing import Literal
from datetime import datetime


class CreateReminderInput(BaseModel):
    title: str = Field(description="Short title for the reminder.")
    content: str = Field(default=None, description="Optional extra detail.")
    scheduled_time: str = Field(
        description="Date and time for the FIRST trigger in ISO format (YYYY-MM-DD HH:MM:SS). For recurring reminders, set this to NOW or NOW + interval."
    )
    repeat_interval: Literal["minutes", "hours", "days", "weeks", "months"] = Field(
        default=None,
        description="Interval unit for repetition (e.g., 'minutes' for every N minutes).",
    )
    repeat_value: int = Field(
        default=None,
        description="Value for interval (e.g., 25 for 'every 25 minutes').",
    )


@tool(args_schema=CreateReminderInput)
def create_reminder(
    title: str,
    scheduled_time: str,
    content: str = None,
    repeat_interval: str = None,
    repeat_value: int = None,
) -> str:
    """
    Schedules a new reminder or alarm. For RECURRING reminders, set scheduled_time to NOW (or NOW + interval) and provide repeat_interval + repeat_value.
    """
    import app_state

    try:
        dt = datetime.fromisoformat(scheduled_time)
        if not app_state.reminder_manager:
            return "Error: Reminder manager not ready."
        app_state.reminder_manager.add_reminder(
            title, content, dt, repeat_interval, repeat_value
        )
        return f"OK: Reminder '{title}' scheduled for {scheduled_time}."
    except Exception as e:
        return f"Error scheduling: {str(e)}"


@tool
def list_reminders() -> str:
    """Lists all active reminders and their schedules."""
    import app_state

    if not app_state.reminder_manager:
        return "Reminder system not initialized."
    reminders = app_state.reminder_manager.list_reminders()
    if not reminders:
        return "You have no active reminders."

    res = "### Current Reminders:\n\n"
    for r in reminders:
        status = "Active" if r.is_active else "Off"
        res += f"- **ID {r.id}:** {r.title} (Scheduled: {r.scheduled_time}) - Status: {status}\n"
    return res


@tool
def delete_reminder(reminder_id: int) -> str:
    """Deletes a reminder by its ID."""
    import app_state

    if not app_state.reminder_manager:
        return "Error: Reminder manager not ready."
    app_state.reminder_manager.delete_reminder(reminder_id)
    return f"Reminder {reminder_id} deleted."

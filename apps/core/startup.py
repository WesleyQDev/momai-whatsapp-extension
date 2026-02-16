import asyncio
import os
import threading
import time
from contextlib import asynccontextmanager

import psutil

import app_state
from database.models import SessionLocal, Settings, init_db
from services.system.resource_manager import resource_manager


async def init_system_task() -> None:
    """Background task to initialize the system without blocking the server."""
    try:
        await app_state.send_init_event("api", "System protocols initialized", 10)

        init_db()
        await app_state.send_init_event("api", "Database connected", 15)

        app_state.initialize_ai_stack()
        await app_state.send_init_event("brain", "AI modules loaded", 30)

        # 1. Start LLM initialization in background as early as possible
        db = SessionLocal()
        settings = db.query(Settings).first()
        if not settings:
            settings = Settings()
            db.add(settings)
            db.commit()
            db.refresh(settings)

        def on_brain_init(status: str) -> None:
            if app_state.main_loop:
                asyncio.run_coroutine_threadsafe(
                    app_state.send_init_event("brain", status, 82), app_state.main_loop
                )

        # Inicia o motor de IA em paralelo
        app_state.orchestrator.initialize_llm(on_brain_init)

        # 2. Carrega skills
        app_state.extension_manager.load_all()
        skill_count = len(app_state.extension_manager.get_all_skills())
        await app_state.send_init_event(
            "extensions", f"{skill_count} skills loaded", 45
        )

        # Indexing tools and skills
        try:
            from utils.indexer import index_all_system_tools, index_all_skills

            await app_state.send_init_event("brain", "Indexing tools...", 50)
            await index_all_system_tools()
            await app_state.send_init_event("brain", "Indexing skills...", 55)
            await index_all_skills()
        except Exception as exc:
            app_state.logger.warning("[Main] Indexing error: %s", exc)

        # 3. Apply settings
        await app_state.send_init_event("brain", "Applying settings...", 65)
        app_state.tts.tts.set_voice(settings.tts_voice)
        app_state.tts.tts.set_enabled(settings.tts_enabled)
        app_state.orchestrator.SYSTEM_PROMPT = settings.assistant_persona

        resource_manager.on_notify_callback = app_state.notify_economy_change
        resource_manager.start()
        await app_state.send_init_event("extensions", "Resource monitor enabled", 70)

        # 4. Checkpointer Setup
        try:
            from ai.orchestrator import AsyncSqliteSaver, CHECKPOINT_PATH
            import sqlite3

            checkpointer_cm = AsyncSqliteSaver.from_conn_string(CHECKPOINT_PATH)
            app_state.orchestrator.checkpointer = await checkpointer_cm.__aenter__()
            app_state.orchestrator.checkpointer_cleanup = checkpointer_cm

            conn = sqlite3.connect(CHECKPOINT_PATH)
            conn.execute("PRAGMA journal_mode=WAL")

            # Restore table creation logic
            def _get_columns(table_name: str) -> set[str]:
                cols = set()
                try:
                    for row in conn.execute(f"PRAGMA table_info({table_name})"):
                        cols.add(str(row[1]))
                except:
                    pass
                return cols

            expected_checkpoints = {
                "thread_id",
                "checkpoint_ns",
                "checkpoint_id",
                "parent_checkpoint_id",
                "type",
                "checkpoint",
                "metadata",
            }
            expected_writes = {
                "thread_id",
                "checkpoint_ns",
                "checkpoint_id",
                "task_id",
                "idx",
                "channel",
                "type",
                "value",
            }

            checkpoints_cols = _get_columns("checkpoints")
            writes_cols = _get_columns("writes")

            if checkpoints_cols and not expected_checkpoints.issubset(checkpoints_cols):
                conn.execute("DROP TABLE IF EXISTS checkpoints")
                checkpoints_cols = set()
            if writes_cols and not expected_writes.issubset(writes_cols):
                conn.execute("DROP TABLE IF EXISTS writes")
                writes_cols = set()

            if not checkpoints_cols:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS checkpoints (
                        thread_id TEXT NOT NULL,
                        checkpoint_ns TEXT NOT NULL DEFAULT '',
                        checkpoint_id TEXT NOT NULL,
                        parent_checkpoint_id TEXT,
                        type TEXT,
                        checkpoint BLOB,
                        metadata BLOB,
                        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
                    )
                """)

            if not writes_cols:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS writes (
                        thread_id TEXT NOT NULL,
                        checkpoint_ns TEXT NOT NULL DEFAULT '',
                        checkpoint_id TEXT NOT NULL,
                        task_id TEXT NOT NULL,
                        idx INTEGER NOT NULL,
                        channel TEXT NOT NULL,
                        type TEXT,
                        value BLOB,
                        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
                    )
                """)

            conn.commit()
            conn.close()
        except Exception as exc:
            app_state.logger.exception("[Main] Checkpointer Error: %s", exc)

        # 5. Services
        app_state.reminder_manager = app_state.ReminderManager(
            broadcast_callback=app_state.broadcast_to_sockets,
            tts_callback=app_state.tts.speak_sentence,
        )
        app_state.reminder_manager.start()

        def on_wake_word(text: str) -> None:
            if app_state.main_loop:
                asyncio.run_coroutine_threadsafe(
                    app_state.process_voice_command(text), app_state.main_loop
                )

        def should_bypass_wake_word() -> bool:
            state = app_state.get_graph_state()
            return state["view"] is not None and state["bypass_wake_word"]

        await app_state.send_init_event("brain", "Starting voice detector...", 85)
        app_state.ww = app_state.WakeWordDetector(
            keyword="sistema",
            callback=on_wake_word,
            bypass_condition=should_bypass_wake_word,
        )
        if settings.wake_word_enabled:
            app_state.ww.start()

        # 6. Final Sync - Aguarda o LLM e Voz apenas no final se necessário
        await app_state.send_init_event("brain", "Finalizing brain connection...", 90)
        await asyncio.to_thread(
            app_state.orchestrator.llm_ready_event.wait, timeout=30.0
        )

        if settings.tts_enabled:
            await app_state.send_init_event("voice", "Syncing local voice...", 95)
            await asyncio.to_thread(app_state.tts.tts.wait_until_ready, timeout=10.0)

        await app_state.send_init_event("ready", "System ready.", 100)
        app_state.system_ready.set()

        # 7. Check Daily Briefing
        from services.system.briefing import check_and_run_daily_briefing

        asyncio.create_task(check_and_run_daily_briefing())

        db.close()
    except Exception as exc:
        app_state.logger.exception("[InitTask] Fatal error: %s", exc)
        await app_state.send_init_event("error", f"Error: {str(exc)}", 0)


@asynccontextmanager
async def lifespan(app):
    app_state.main_loop = asyncio.get_running_loop()

    asyncio.create_task(init_system_task())
    asyncio.create_task(app_state.broadcast_resource_usage())

    def monitor_parent() -> None:
        """Exits if parent process (Electron) dies."""
        parent = psutil.Process(os.getpid()).parent()
        if parent:
            parent.wait()
            os._exit(0)

    if os.name == "nt":
        threading.Thread(target=monitor_parent, daemon=True).start()

    yield

    if app_state.ww:
        app_state.ww.stop()
    if app_state.reminder_manager:
        app_state.reminder_manager.stop()
    resource_manager.stop()

    if (
        app_state.orchestrator
        and hasattr(app_state.orchestrator, "checkpointer_cleanup")
        and app_state.orchestrator.checkpointer_cleanup
    ):
        try:
            await app_state.orchestrator.checkpointer_cleanup.__aexit__(
                None, None, None
            )
            app_state.logger.info("[Main] Checkpointer closed.")
        except Exception as exc:
            app_state.logger.exception("[Main] Error closing checkpointer: %s", exc)

    app_state.logger.info("[FastAPI] Shutting down...")

    try:
        from ai.embeddings import embeddings

        embeddings.stop()
        app_state.logger.info("[FastAPI] Embeddings server stopped.")
    except Exception as exc:
        app_state.logger.exception("[FastAPI] Error stopping embeddings: %s", exc)

    if app_state.reminder_manager:
        try:
            app_state.reminder_manager.stop()
            app_state.logger.info("[FastAPI] Reminder manager stopped.")
        except Exception as exc:
            app_state.logger.exception(
                "[FastAPI] Error stopping reminder manager: %s", exc
            )

    if app_state.ww:
        try:
            app_state.ww.stop()
            app_state.logger.info("[FastAPI] Wake word detector stopped.")
        except Exception as exc:
            app_state.logger.exception(
                "[FastAPI] Error stopping wake word detector: %s", exc
            )

    try:
        from ai.providers.local_llama import stop_server

        stop_server()
        app_state.logger.info("[FastAPI] Main LLM server stopped.")
    except Exception as exc:
        app_state.logger.exception("[FastAPI] Error stopping LLM server: %s", exc)

    try:
        app_state.tts.stop_all()
        app_state.logger.info("[FastAPI] TTS workers stopped.")
    except Exception as exc:
        app_state.logger.exception("[FastAPI] Error stopping TTS: %s", exc)

    time.sleep(0.5)
    app_state.logger.info("[FastAPI] Shutdown complete.")

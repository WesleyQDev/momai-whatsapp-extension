from fastapi import APIRouter, BackgroundTasks

from api.schemas import MemorySearch, NoteCreate, NoteUpdate, NotesImport

router = APIRouter()


@router.get("/memory/notes")
async def list_memory_notes():
    from services.memory.external_memory import list_notes
    return list_notes()


@router.get("/memory/notes/{note_id}")
async def get_memory_note(note_id: str):
    from services.memory.external_memory import get_note
    note = get_note(note_id)
    if not note:
        return {"status": "error", "message": "Note not found"}
    return note


@router.post("/memory/notes")
async def create_memory_note(payload: NoteCreate):
    from services.memory.external_memory import create_note
    return create_note(payload.title, payload.content)


@router.patch("/memory/notes/{note_id}")
async def update_memory_note(note_id: str, payload: NoteUpdate):
    from services.memory.external_memory import update_note
    updated = update_note(note_id, payload.title, payload.content)
    if not updated:
        return {"status": "error", "message": "Note not found"}
    return updated


@router.delete("/memory/notes/{note_id}")
async def delete_memory_note(note_id: str):
    from services.memory.external_memory import delete_note
    deleted = delete_note(note_id)
    return {"status": "deleted" if deleted else "not_found"}


@router.post("/memory/notes/import")
async def import_memory_notes(payload: NotesImport, background: BackgroundTasks):
    from services.memory.external_memory import import_notes

    def _do_import() -> None:
        import_notes([item.model_dump() for item in payload.files])

    background.add_task(_do_import)
    return {"status": "queued", "count": len(payload.files)}


@router.post("/memory/search")
async def search_memory(payload: MemorySearch):
    from services.memory.external_memory import search_memory
    limit = payload.limit or None
    results = await search_memory(payload.query, limit=limit or 6)
    return {"query": payload.query, "results": results}

import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Iterable
import logging
import unicodedata

from sqlalchemy import text

from ai.embeddings import embeddings
from database.models import SessionLocal, ExternalNote, engine
from database.vector_db import vector_db
from utils.tokenizer import count_tokens

logger = logging.getLogger("momai.external_memory")

NOTES_DIR_NAME = "notes"
VECTORS_TABLE = "external_notes"
FTS_TABLE = "note_chunks_fts"

DEFAULT_CHUNK_SIZE = int(os.getenv("MOMAI_MEMORY_CHUNK_SIZE", "900"))
DEFAULT_CHUNK_OVERLAP = int(os.getenv("MOMAI_MEMORY_CHUNK_OVERLAP", "120"))
DEFAULT_BM25_WEIGHT = float(os.getenv("MOMAI_MEMORY_BM25_WEIGHT", "0.45"))
DEFAULT_VECTOR_WEIGHT = float(os.getenv("MOMAI_MEMORY_VECTOR_WEIGHT", "0.55"))
DEFAULT_MAX_SNIPPETS = int(os.getenv("MOMAI_MEMORY_MAX_SNIPPETS", "6"))
DEFAULT_MAX_TOKENS = int(os.getenv("MOMAI_MEMORY_MAX_TOKENS", "650"))


def _get_data_dir() -> Path:
    data_dir = os.environ.get("MOMAI_DATA_DIR")
    if data_dir:
        return Path(data_dir)
    return Path(__file__).parent.parent.parent


def _notes_dir() -> Path:
    return _get_data_dir() / NOTES_DIR_NAME


def _ensure_notes_dir() -> Path:
    notes_dir = _notes_dir()
    notes_dir.mkdir(parents=True, exist_ok=True)
    return notes_dir


def _note_filename(note_id: str) -> str:
    return f"{note_id}.md"


def _resolve_note_path(path_value: str) -> Path:
    path = Path(path_value)
    if path.is_absolute():
        return path
    return _get_data_dir() / path


def _slugify(text_value: str) -> str:
    text_value = text_value.strip().lower()
    text_value = re.sub(r"[^a-z0-9\s-]", "", text_value)
    text_value = re.sub(r"\s+", "-", text_value)
    return text_value[:80] or "nota"


def _normalize_text(text_value: str) -> str:
    return text_value.replace("\r\n", "\n").replace("\r", "\n")


def _normalize_query(text_value: str) -> str:
    if not text_value:
        return ""
    normalized = unicodedata.normalize("NFKD", text_value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return ascii_text.lower()


def _build_fts_query(query: str) -> str:
    normalized = _normalize_query(query)
    tokens = re.findall(r"[a-z0-9]+", normalized)
    stopwords = {
        "a", "as", "o", "os", "um", "uma", "uns", "umas",
        "de", "da", "do", "das", "dos", "e", "ou", "em",
        "para", "por", "com", "sem", "na", "no", "nas", "nos",
        "que", "qual", "quais", "quem", "quando", "onde", "como",
        "meu", "minha", "meus", "minhas", "seu", "sua", "seus", "suas",
        "eu", "voce", "voce", "ele", "ela", "eles", "elas",
        "isso", "essa", "esse", "isto", "esta", "este",
        "sobre", "favor", "porfavor"
    }
    filtered = [t for t in tokens if t not in stopwords and len(t) > 1]
    if not filtered:
        filtered = [t for t in tokens if len(t) > 1]
    if not filtered:
        return ""
    return " OR ".join(filtered)


def _split_text(text_value: str, chunk_size: int, overlap: int) -> list[str]:
    clean_text = _normalize_text(text_value).strip()
    if not clean_text:
        return []

    paragraphs = [p.strip() for p in clean_text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""

    def _flush(buffer: str):
        if buffer:
            chunks.append(buffer.strip())

    for paragraph in paragraphs:
        if len(paragraph) > chunk_size:
            if current:
                _flush(current)
                current = ""
            start = 0
            while start < len(paragraph):
                end = min(len(paragraph), start + chunk_size)
                chunks.append(paragraph[start:end].strip())
                start = max(end - overlap, end)
            continue

        if len(current) + len(paragraph) + 2 <= chunk_size:
            current = f"{current}\n\n{paragraph}".strip()
        else:
            _flush(current)
            current = paragraph

    _flush(current)
    return [c for c in chunks if c]


def _ensure_fts_table():
    try:
        with engine.connect() as conn:
            conn.execute(text(
                f"CREATE VIRTUAL TABLE IF NOT EXISTS {FTS_TABLE} "
                "USING fts5(note_id, chunk_id, title, path, content)"
            ))
            conn.commit()
    except Exception as exc:
        logger.warning(f"[Memory] FTS table unavailable: {exc}")


def _clear_fts_for_note(note_id: str):
    _ensure_fts_table()
    try:
        with engine.connect() as conn:
            conn.execute(text(f"DELETE FROM {FTS_TABLE} WHERE note_id = :note_id"), {"note_id": note_id})
            conn.commit()
    except Exception:
        pass


def _index_fts(note_id: str, title: str, path_value: str, chunks: Iterable[str]):
    _ensure_fts_table()
    rows = [
        {
            "note_id": note_id,
            "chunk_id": f"{note_id}:{idx}",
            "title": title,
            "path": path_value,
            "content": chunk
        }
        for idx, chunk in enumerate(chunks)
    ]

    try:
        with engine.connect() as conn:
            conn.execute(text(f"DELETE FROM {FTS_TABLE} WHERE note_id = :note_id"), {"note_id": note_id})
            if rows:
                conn.execute(text(
                    f"INSERT INTO {FTS_TABLE} (note_id, chunk_id, title, path, content) "
                    "VALUES (:note_id, :chunk_id, :title, :path, :content)"
                ), rows)
            conn.commit()
    except Exception:
        pass


def _get_vector_table(dim: int):
    import pyarrow as pa

    schema = pa.schema([
        pa.field("vector", pa.list_(pa.float32(), dim)),
        pa.field("note_id", pa.string()),
        pa.field("chunk_id", pa.string()),
        pa.field("title", pa.string()),
        pa.field("path", pa.string()),
        pa.field("text", pa.string()),
        pa.field("updated_at", pa.string())
    ])

    table = vector_db.get_table(VECTORS_TABLE, schema=schema)
    if "vector" in table.schema.names:
        v_type = table.schema.field("vector").type
        current_dim = getattr(v_type, "list_size", None)
        if current_dim and current_dim != dim:
            vector_db.connect().drop_table(VECTORS_TABLE)
            table = vector_db.get_table(VECTORS_TABLE, schema=schema)
    return table


def _safe_delete_vector_rows(table, note_id: str):
    safe_id = note_id.replace("'", "''")
    try:
        table.delete(f"note_id = '{safe_id}'")
    except Exception:
        pass


def _write_note_file(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_normalize_text(content), encoding="utf-8")


def _read_note_file(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def list_notes() -> list[dict]:
    db = SessionLocal()
    try:
        notes = db.query(ExternalNote).order_by(ExternalNote.updated_at.desc()).all()
        results = []
        for note in notes:
            path = _resolve_note_path(note.path)
            preview = _read_note_file(path)[:240]
            results.append({
                "id": note.id,
                "title": note.title,
                "path": note.path,
                "source": note.source,
                "created_at": note.created_at.isoformat() if note.created_at else None,
                "updated_at": note.updated_at.isoformat() if note.updated_at else None,
                "preview": preview
            })
        return results
    finally:
        db.close()


def get_note(note_id: str) -> dict | None:
    db = SessionLocal()
    try:
        note = db.query(ExternalNote).filter(ExternalNote.id == note_id).first()
        if not note:
            return None
        path = _resolve_note_path(note.path)
        content = _read_note_file(path)
        return {
            "id": note.id,
            "title": note.title,
            "path": note.path,
            "source": note.source,
            "created_at": note.created_at.isoformat() if note.created_at else None,
            "updated_at": note.updated_at.isoformat() if note.updated_at else None,
            "content": content
        }
    finally:
        db.close()


def create_note(title: str, content: str, source: str = "local") -> dict:
    _ensure_notes_dir()
    note_id = str(uuid.uuid4())
    filename = _note_filename(note_id)
    relative_path = str(Path(NOTES_DIR_NAME) / filename)
    path = _resolve_note_path(relative_path)

    _write_note_file(path, content)

    db = SessionLocal()
    try:
        now = datetime.now()
        note = ExternalNote(
            id=note_id,
            title=title.strip() or "Nova nota",
            path=relative_path,
            source=source,
            created_at=now,
            updated_at=now
        )
        db.add(note)
        db.commit()
    finally:
        db.close()

    reindex_note(note_id)
    return get_note(note_id)


def update_note(note_id: str, title: str | None, content: str | None) -> dict | None:
    db = SessionLocal()
    try:
        note = db.query(ExternalNote).filter(ExternalNote.id == note_id).first()
        if not note:
            return None
        if title is not None:
            note.title = title.strip() or note.title
        if content is not None:
            path = _resolve_note_path(note.path)
            _write_note_file(path, content)
        note.updated_at = datetime.now()
        db.commit()
    finally:
        db.close()

    reindex_note(note_id)
    return get_note(note_id)


def delete_note(note_id: str) -> bool:
    db = SessionLocal()
    try:
        note = db.query(ExternalNote).filter(ExternalNote.id == note_id).first()
        if not note:
            return False
        path = _resolve_note_path(note.path)
        if path.exists():
            path.unlink()
        db.delete(note)
        db.commit()
    finally:
        db.close()

    _clear_fts_for_note(note_id)
    try:
        table = vector_db.get_table(VECTORS_TABLE)
        _safe_delete_vector_rows(table, note_id)
    except Exception:
        pass
    return True


def import_notes(files: list[dict]) -> list[dict]:
    created = []
    for item in files:
        name = item.get("name") or "nota"
        content = item.get("content") or ""
        title = Path(name).stem
        created_note = create_note(title=title, content=content, source="import")
        if created_note:
            created.append(created_note)
    return created


def reindex_note(note_id: str) -> None:
    db = SessionLocal()
    title = ""
    path_value = ""
    chunks: list[str] = []
    try:
        note = db.query(ExternalNote).filter(ExternalNote.id == note_id).first()
        if not note:
            return
        title = note.title
        path_value = note.path
        path = _resolve_note_path(path_value)
        content = _read_note_file(path)
        chunks = _split_text(content, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP)
        if not chunks:
            _clear_fts_for_note(note_id)
            try:
                table = vector_db.get_table(VECTORS_TABLE)
                _safe_delete_vector_rows(table, note_id)
            except Exception:
                pass
            return
        note.last_indexed_at = datetime.now()
        db.commit()
    finally:
        db.close()

    _index_fts(note_id, title, path_value, chunks)

    async def _index_vectors():
        first_vector = await embeddings.embed_text(chunks[0])
        dim = len(first_vector) if first_vector else 1024
        table = _get_vector_table(dim)
        _safe_delete_vector_rows(table, note_id)

        vectors = await embeddings.embed_documents(chunks)
        rows = []
        updated_at = datetime.now().isoformat()
        for idx, (chunk, vec) in enumerate(zip(chunks, vectors)):
            if not vec or len(vec) != dim:
                continue
            rows.append({
                "vector": vec,
                "note_id": note_id,
                "chunk_id": f"{note_id}:{idx}",
                "title": title,
                "path": path_value,
                "text": chunk,
                "updated_at": updated_at
            })
        if rows:
            table.add(rows)

    import asyncio

    try:
        loop = asyncio.get_running_loop()
        task = loop.create_task(_index_vectors())
        if loop.is_running():
            return
        loop.run_until_complete(task)
    except RuntimeError:
        asyncio.run(_index_vectors())


def _keyword_search(query: str, limit: int) -> list[dict]:
    _ensure_fts_table()
    cleaned = _build_fts_query(query)
    if not cleaned:
        return []

    sql = (
        f"SELECT note_id, chunk_id, title, path, content, bm25({FTS_TABLE}) as score "
        f"FROM {FTS_TABLE} WHERE {FTS_TABLE} MATCH :query "
        "ORDER BY score LIMIT :limit"
    )

    try:
        with engine.connect() as conn:
            rows = conn.execute(text(sql), {"query": cleaned, "limit": limit}).fetchall()
    except Exception:
        return []

    results = []
    for row in rows:
        score = row.score
        keyword_score = 1 / (1 + score) if score is not None else 0.0
        results.append({
            "note_id": row.note_id,
            "chunk_id": row.chunk_id,
            "title": row.title,
            "path": row.path,
            "text": row.content,
            "keyword_score": keyword_score
        })
    return results


async def _vector_search(query: str, limit: int) -> list[dict]:
    try:
        table = vector_db.get_table(VECTORS_TABLE)
    except Exception:
        return []

    query_vector = await embeddings.embed_text(query)
    results = table.search(query_vector).limit(limit).to_list()
    output = []
    for item in results:
        distance = item.get("_distance", 1.0)
        vector_score = max(0.0, 1.0 - float(distance))
        output.append({
            "note_id": item.get("note_id"),
            "chunk_id": item.get("chunk_id"),
            "title": item.get("title"),
            "path": item.get("path"),
            "text": item.get("text"),
            "vector_score": vector_score
        })
    return output


def _merge_scores(keyword_hits: list[dict], vector_hits: list[dict], limit: int) -> list[dict]:
    combined: dict[str, dict] = {}

    for hit in keyword_hits:
        combined[hit["chunk_id"]] = {
            **hit,
            "vector_score": 0.0
        }

    for hit in vector_hits:
        entry = combined.get(hit["chunk_id"])
        if entry:
            entry["vector_score"] = max(entry.get("vector_score", 0.0), hit.get("vector_score", 0.0))
        else:
            combined[hit["chunk_id"]] = {
                **hit,
                "keyword_score": 0.0
            }

    weighted = []
    for entry in combined.values():
        kw = entry.get("keyword_score", 0.0)
        vec = entry.get("vector_score", 0.0)
        combined_score = (DEFAULT_BM25_WEIGHT * kw) + (DEFAULT_VECTOR_WEIGHT * vec)
        entry["score"] = combined_score
        weighted.append(entry)

    weighted.sort(key=lambda x: x.get("score", 0.0), reverse=True)
    return weighted[:limit]


def _linear_search(query: str, limit: int) -> list[dict]:
    tokens_query = _build_fts_query(query)
    if not tokens_query:
        return []
    tokens = [t.strip() for t in tokens_query.split("OR") if t.strip()]
    if not tokens:
        return []

    db = SessionLocal()
    results: list[dict] = []
    try:
        notes = db.query(ExternalNote).order_by(ExternalNote.updated_at.desc()).all()
        for note in notes:
            path = _resolve_note_path(note.path)
            content = _read_note_file(path)
            haystack = f"{note.title}\n{content}".lower()
            score = 0.0
            for token in tokens:
                if token in haystack:
                    score += 1.0
            if score <= 0.0:
                continue
            snippet = content.strip().split("\n")[0] if content else ""
            results.append({
                "note_id": note.id,
                "chunk_id": f"{note.id}:linear",
                "title": note.title,
                "path": note.path,
                "text": snippet,
                "keyword_score": score / max(1.0, len(tokens))
            })
    finally:
        db.close()

    results.sort(key=lambda x: x.get("keyword_score", 0.0), reverse=True)
    return results[:limit]


async def search_memory(query: str, limit: int = DEFAULT_MAX_SNIPPETS) -> list[dict]:
    keyword_hits = _keyword_search(query, limit=limit * 3)
    vector_hits = await _vector_search(query, limit=limit * 3)
    if not keyword_hits and not vector_hits:
        fallback_hits = _linear_search(query, limit=limit)
        return fallback_hits
    return _merge_scores(keyword_hits, vector_hits, limit=limit)


async def build_memory_context(query: str, max_tokens: int = DEFAULT_MAX_TOKENS) -> str:
    results = await search_memory(query, limit=DEFAULT_MAX_SNIPPETS)
    if not results:
        return ""

    lines: list[str] = []
    used_tokens = 0
    for hit in results:
        title = hit.get("title") or "Nota"
        text_value = hit.get("text") or ""
        snippet = text_value.strip()
        if not snippet:
            continue
        entry = f"- {title}: {snippet}"
        entry_tokens = count_tokens(entry)
        if used_tokens + entry_tokens > max_tokens:
            break
        lines.append(entry)
        used_tokens += entry_tokens

    return "\n".join(lines)

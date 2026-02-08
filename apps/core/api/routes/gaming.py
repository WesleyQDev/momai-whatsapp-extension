import asyncio

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.deps import get_db
from api.schemas import GamingAppCreate
from database.models import GamingApp
from services.system.resource_manager import resource_manager

router = APIRouter()


@router.get("/system/gaming-apps")
async def list_gaming_apps(db: Session = Depends(get_db)):
    apps = db.query(GamingApp).all()
    return [
        {"id": app.id, "name": app.name, "executable": app.executable, "is_active": app.is_active}
        for app in apps
    ]


@router.post("/system/gaming-apps")
async def add_gaming_app(data: GamingAppCreate, db: Session = Depends(get_db)):
    try:
        new_app = GamingApp(name=data.name, executable=data.executable.lower())
        db.add(new_app)
        db.commit()
        resource_manager.start()
        return {"status": "ok"}
    except Exception as exc:
        db.rollback()
        return {"status": "error", "message": str(exc)}


@router.delete("/system/gaming-apps/{app_id}")
async def delete_gaming_app(app_id: int, db: Session = Depends(get_db)):
    def _delete_app() -> bool:
        app = db.query(GamingApp).filter(GamingApp.id == app_id).first()
        if app:
            db.delete(app)
            db.commit()
            resource_manager.start()
            return True
        return False

    success = await asyncio.to_thread(_delete_app)
    if success:
        return {"status": "ok"}
    return {"status": "error", "message": "App nao encontrado"}

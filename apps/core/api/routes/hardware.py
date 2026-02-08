from fastapi import APIRouter
import psutil

router = APIRouter()


@router.get("/extensions/hardware-stats")
async def get_hardware_stats():
    """Retorna dados reais de hardware para dashboards dinamicos."""
    return {
        "cpu_usage": psutil.cpu_percent(),
        "ram_usage": psutil.virtual_memory().percent,
        "active_processes": len(psutil.pids()),
        "vram_usage": 0
    }

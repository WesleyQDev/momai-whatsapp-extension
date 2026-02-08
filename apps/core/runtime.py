import logging
import sys
import threading

logger = logging.getLogger(__name__)


class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "/status" not in record.getMessage()


def configure_logging() -> None:
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    if not root_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
        root_logger.addHandler(handler)


def install_uvicorn_access_filter() -> None:
    logging.getLogger("uvicorn.access").addFilter(EndpointFilter())


def patch_thread_start() -> None:
    """Monkey-patch threading.Thread.start to robustly handle race conditions."""
    original_start = threading.Thread.start

    def _safe_start(self, *args, **kwargs):
        try:
            return original_start(self, *args, **kwargs)
        except RuntimeError as exc:
            if "threads can only be started once" in str(exc):
                logger.warning("[System] SafeGuard: Thread %s already started. Ignoring.", self.name)
                return None
            raise

    threading.Thread.start = _safe_start

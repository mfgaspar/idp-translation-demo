import json
import logging
import sys
from typing import Any


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if hasattr(record, "case_id"):
            payload["case_id"] = getattr(record, "case_id")
        if hasattr(record, "action"):
            payload["action"] = getattr(record, "action")
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: int = logging.INFO) -> None:
    root = logging.getLogger("translation_tool")
    root.setLevel(level)
    if not root.handlers:
        h = logging.StreamHandler(sys.stderr)
        h.setFormatter(JsonFormatter())
        root.addHandler(h)


def log_agent_action(case_id: int | None, action: str, message: str, **extra: Any) -> None:
    log = logging.getLogger("translation_tool.agent")
    payload = {"case_id": case_id, "action": action, **extra}
    log.info(message, extra=payload)

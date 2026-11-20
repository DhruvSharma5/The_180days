"""Safe structured logging helpers for application diagnostics."""

import json
import logging
import traceback
from datetime import datetime, timezone
from pathlib import Path

_SAFE_FIELDS = {
    "collection",
    "error_code",
    "exception_type",
    "index",
    "method",
    "missing_variables",
    "request_id",
    "route",
    "stack",
    "status_code",
}


def log_event(
    logger: logging.Logger, level: int, event: str, **fields: object
) -> None:
    payload: dict[str, object] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": logging.getLevelName(level),
        "event": event,
    }
    payload.update(
        {key: value for key, value in fields.items() if key in _SAFE_FIELDS}
    )
    logger.log(level, json.dumps(payload, separators=(",", ":"), sort_keys=True))


def safe_stack_frames(exc: BaseException) -> list[dict[str, str | int]]:
    return [
        {
            "file": Path(frame.filename).name,
            "function": frame.name,
            "line": frame.lineno,
        }
        for frame in traceback.extract_tb(exc.__traceback__)[-8:]
    ]

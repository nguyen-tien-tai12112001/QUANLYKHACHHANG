"""Best-effort progress for Excel exports in the single backend worker.

Progress contains no customer data. A missing task header keeps API exports
compatible with existing callers; the authenticated status endpoint never
returns another user's task.
"""

from __future__ import annotations

import re
import threading
import time
from typing import Any

from fastapi import HTTPException, Request


_TASK_ID = re.compile(r"^excel-[0-9]{10,16}-[0-9]{1,8}-[0-9a-z]{6,8}$")
_TTL_SECONDS = 60 * 60
_MAX_TASKS = 500
_LOCK = threading.Lock()
_TASKS: dict[str, dict[str, Any]] = {}


def _prune(now: float) -> None:
    expired = [key for key, item in _TASKS.items() if now - item["updated_at"] > _TTL_SECONDS]
    for key in expired:
        _TASKS.pop(key, None)
    if len(_TASKS) > _MAX_TASKS:
        oldest = sorted(_TASKS, key=lambda key: _TASKS[key]["updated_at"])
        for key in oldest[: len(_TASKS) - _MAX_TASKS]:
            _TASKS.pop(key, None)


def begin_export(request: Request, user, stage: str = "Đang chuẩn bị dữ liệu") -> str | None:
    task_id = request.headers.get("x-export-task", "")
    if not _TASK_ID.fullmatch(task_id):
        return None
    now = time.monotonic()
    with _LOCK:
        _prune(now)
        _TASKS[task_id] = {
            "owner_id": str(user.id),
            "percent": 0,
            "stage": stage,
            "updated_at": now,
        }
    return task_id


def update_export(task_id: str | None, percent: int, stage: str) -> None:
    if not task_id:
        return
    with _LOCK:
        item = _TASKS.get(task_id)
        if item:
            item["percent"] = max(item["percent"], min(99, max(0, int(percent))))
            item["stage"] = stage
            item["updated_at"] = time.monotonic()


def get_export_progress(task_id: str, user) -> dict[str, Any]:
    with _LOCK:
        _prune(time.monotonic())
        item = _TASKS.get(task_id)
        if not item or item["owner_id"] != str(user.id):
            raise HTTPException(status_code=404, detail="Không tìm thấy tiến độ xuất Excel")
        return {"percent": item["percent"], "stage": item["stage"]}

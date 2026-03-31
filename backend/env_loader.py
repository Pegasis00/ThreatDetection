from __future__ import annotations

import os
from pathlib import Path

_LOADED_ENV_FILES: set[Path] = set()


def _strip_wrapping_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    return value


def load_backend_env() -> Path:
    env_path = Path(__file__).resolve().parent / ".env"
    if env_path in _LOADED_ENV_FILES or not env_path.exists():
        return env_path

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue

        os.environ.setdefault(key, _strip_wrapping_quotes(value.strip()))

    _LOADED_ENV_FILES.add(env_path)
    return env_path

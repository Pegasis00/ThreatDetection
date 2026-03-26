from __future__ import annotations

import os
from pathlib import Path
from threading import Lock
from typing import TYPE_CHECKING, Any, TypeAlias

if TYPE_CHECKING:
    from ultralytics import YOLO as YOLOModel
else:
    YOLOModel: TypeAlias = Any

try:
    from ultralytics import YOLO
except ImportError as exc:  # pragma: no cover
    YOLO = None
    YOLO_IMPORT_ERROR = str(exc)
else:
    YOLO_IMPORT_ERROR = None

try:
    from tensorflow.keras.models import load_model as load_keras_model
except ImportError as exc:  # pragma: no cover
    load_keras_model = None
    TENSORFLOW_IMPORT_ERROR = str(exc)
else:
    TENSORFLOW_IMPORT_ERROR = None

MODELS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = MODELS_DIR.parent.parent


def _resolve_model_path(env_var: str, candidate_names: tuple[str, ...]) -> Path:
    configured_path = os.getenv(env_var)
    if configured_path:
        return Path(configured_path).expanduser().resolve()

    for candidate_name in candidate_names:
        candidate_path = MODELS_DIR / candidate_name
        if candidate_path.exists():
            return candidate_path

    return MODELS_DIR / candidate_names[0]


def _resolve_external_model_path(
    env_var: str,
    candidate_paths: tuple[Path, ...],
) -> Path:
    configured_path = os.getenv(env_var)
    if configured_path:
        return Path(configured_path).expanduser().resolve()

    for candidate_path in candidate_paths:
        resolved_path = candidate_path.expanduser().resolve()
        if resolved_path.exists():
            return resolved_path

    return candidate_paths[0].expanduser().resolve()


WEAPON_MODEL_PATH = _resolve_model_path(
    "Pegasusxz_WEAPON_MODEL",
    ("weapon.pt", "02032026.pt"),
)
SMOKEFIRE_MODEL_PATH = _resolve_model_path(
    "Pegasusxz_SMOKEFIRE_MODEL",
    ("smokefire.pt", "firesmoke.pt"),
)
VIOLENCE_MODEL_PATH = _resolve_external_model_path(
    "Pegasusxz_VIOLENCE_MODEL",
    (
        MODELS_DIR / "violence_model.h5",
        PROJECT_ROOT / "VIOLENCE" / "violence_model.h5",
    ),
)

weapon_model: YOLOModel | None = None
smokefire_model: YOLOModel | None = None
violence_model: Any | None = None
weapon_model_error: str | None = None
smokefire_model_error: str | None = None
violence_model_error: str | None = None

_load_lock = Lock()


def _load_single_model(model_path: Path) -> YOLOModel:
    if YOLO is None:
        raise RuntimeError(f"Ultralytics is unavailable: {YOLO_IMPORT_ERROR}")
    if not model_path.exists():
        raise FileNotFoundError(f"Missing model file: {model_path}")
    return YOLO(str(model_path))


def _load_single_violence_model(model_path: Path) -> Any:
    if load_keras_model is None:
        raise RuntimeError(f"TensorFlow is unavailable: {TENSORFLOW_IMPORT_ERROR}")
    if not model_path.exists():
        raise FileNotFoundError(f"Missing model file: {model_path}")
    return load_keras_model(str(model_path), compile=False)


def load_models(force_reload: bool = False) -> None:
    global weapon_model
    global smokefire_model
    global violence_model
    global weapon_model_error
    global smokefire_model_error
    global violence_model_error

    with _load_lock:
        if (
            weapon_model is not None
            and smokefire_model is not None
            and violence_model is not None
            and not force_reload
        ):
            return

        if force_reload:
            weapon_model = None
            smokefire_model = None
            violence_model = None

        weapon_model_error = None
        smokefire_model_error = None
        violence_model_error = None

        try:
            weapon_model = _load_single_model(WEAPON_MODEL_PATH)
        except Exception as exc:  # pragma: no cover
            weapon_model = None
            weapon_model_error = str(exc)

        try:
            smokefire_model = _load_single_model(SMOKEFIRE_MODEL_PATH)
        except Exception as exc:  # pragma: no cover
            smokefire_model = None
            smokefire_model_error = str(exc)

        try:
            violence_model = _load_single_violence_model(VIOLENCE_MODEL_PATH)
        except Exception as exc:  # pragma: no cover
            violence_model = None
            violence_model_error = str(exc)

        if weapon_model is not None and smokefire_model is not None and violence_model is not None:
            print(
                "Loaded surveillance models successfully.",
                {
                    "weapon_path": str(WEAPON_MODEL_PATH),
                    "smokefire_path": str(SMOKEFIRE_MODEL_PATH),
                    "violence_path": str(VIOLENCE_MODEL_PATH),
                },
            )
        else:
            print(
                "Model loading completed with issues.",
                {
                    "weapon_loaded": weapon_model is not None,
                    "smokefire_loaded": smokefire_model is not None,
                    "violence_loaded": violence_model is not None,
                    "weapon_error": weapon_model_error,
                    "smokefire_error": smokefire_model_error,
                    "violence_error": violence_model_error,
                },
            )


def get_model_status() -> dict[str, Any]:
    return {
        "status": (
            "ok"
            if weapon_model is not None and smokefire_model is not None and violence_model is not None
            else "degraded"
        ),
        "dependencies": {
            "ultralytics": {
                "available": YOLO is not None,
                "error": YOLO_IMPORT_ERROR,
            },
            "tensorflow": {
                "available": load_keras_model is not None,
                "error": TENSORFLOW_IMPORT_ERROR,
            },
        },
        "models": {
            "weapon": {
                "loaded": weapon_model is not None,
                "path": str(WEAPON_MODEL_PATH),
                "error": weapon_model_error,
            },
            "smokefire": {
                "loaded": smokefire_model is not None,
                "path": str(SMOKEFIRE_MODEL_PATH),
                "error": smokefire_model_error,
            },
            "violence": {
                "loaded": violence_model is not None,
                "path": str(VIOLENCE_MODEL_PATH),
                "error": violence_model_error,
            },
        },
    }

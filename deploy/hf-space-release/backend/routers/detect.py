import os
import math
from time import perf_counter
from typing import Any

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

try:
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None

try:
    from ..models import loader
    from ..models.violence import create_sequence_state, run_violence_inference
    from ..services.telegram import telegram_notifier
    from ..utils.drawing import draw_annotated_image_base64
except ImportError:  # pragma: no cover
    from models import loader
    from models.violence import create_sequence_state, run_violence_inference
    from services.telegram import telegram_notifier
    from utils.drawing import draw_annotated_image_base64

router = APIRouter(prefix="/detect", tags=["Detection"])

DEFAULT_CONFIDENCE = 0.25
SUPPORTED_MODELS = {"weapon", "smokefire", "violence"}
MIN_CONFIDENCE = 0.01
MAX_CONFIDENCE = 0.99
DEFAULT_MAX_UPLOAD_BYTES = 8 * 1024 * 1024
DEFAULT_MAX_BATCH_IMAGES = 10
SUPPORTED_IMAGE_CONTENT_TYPES = {
    "image/bmp",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}


def _read_int_env(name: str, default: int, *, minimum: int = 1) -> int:
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return default

    try:
        parsed_value = int(raw_value)
    except ValueError:
        return default

    return max(parsed_value, minimum)


MAX_UPLOAD_BYTES = _read_int_env(
    "Pegasusxz_MAX_UPLOAD_BYTES",
    DEFAULT_MAX_UPLOAD_BYTES,
)
MAX_BATCH_IMAGES = _read_int_env(
    "Pegasusxz_MAX_BATCH_IMAGES",
    DEFAULT_MAX_BATCH_IMAGES,
)


def _ensure_runtime_dependencies() -> None:
    if cv2 is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="opencv-python is not installed.",
        )


def normalize_model_name(model_name: str) -> str:
    normalized = (
        model_name.strip().lower().replace("-", "").replace("_", "").replace("/", "")
    )
    if normalized == "smokefire":
        return "smokefire"
    if normalized == "weapon":
        return "weapon"
    if normalized == "violence":
        return "violence"
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported model '{model_name}'. Choose 'weapon', 'smokefire', or 'violence'.",
    )


def sanitize_confidence_threshold(confidence_threshold: float) -> float:
    threshold = float(confidence_threshold)
    if not math.isfinite(threshold):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Confidence threshold must be a finite number.",
        )
    if threshold < MIN_CONFIDENCE or threshold > MAX_CONFIDENCE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Confidence threshold must be between {MIN_CONFIDENCE} and {MAX_CONFIDENCE}.",
        )
    return threshold


def _format_mebibytes(size_bytes: int) -> str:
    return f"{size_bytes / (1024 * 1024):.1f} MB"


def _validate_upload_file(file: UploadFile) -> None:
    if file.content_type and file.content_type.lower() not in SUPPORTED_IMAGE_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported file type '{file.content_type}'. "
                "Upload a JPEG, PNG, WebP, or BMP image."
            ),
        )


def decode_image_bytes(
    payload: bytes,
    *,
    max_bytes: int = MAX_UPLOAD_BYTES,
    source_name: str = "image",
) -> np.ndarray:
    _ensure_runtime_dependencies()
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image payload is empty.",
        )
    if len(payload) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"{source_name.capitalize()} exceeds the { _format_mebibytes(max_bytes) } limit. "
                "Resize or compress the file and try again."
            ),
        )

    image_array = np.frombuffer(payload, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is not a valid image.",
        )
    return image


async def _decode_upload_image(file: UploadFile) -> np.ndarray:
    _validate_upload_file(file)
    payload = await file.read()
    source_name = file.filename or "uploaded image"
    return decode_image_bytes(payload, max_bytes=MAX_UPLOAD_BYTES, source_name=source_name)


def _get_model_instance(model_name: str) -> Any:
    if model_name == "weapon":
        if loader.weapon_model is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=loader.weapon_model_error or "Weapon model is not loaded.",
            )
        return loader.weapon_model

    if model_name == "violence":
        if loader.violence_model is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=loader.violence_model_error or "Violence model is not loaded.",
            )
        return loader.violence_model

    if loader.smokefire_model is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=loader.smokefire_model_error or "Smoke/fire model is not loaded.",
        )
    return loader.smokefire_model


def _serialize_detections(result) -> list[dict[str, object]]:
    detections: list[dict[str, object]] = []
    names = result.names or {}

    for box in result.boxes:
        class_index = int(box.cls[0].item())
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        detections.append(
            {
                "class": str(names.get(class_index, str(class_index))).strip().lower(),
                "confidence": round(float(box.conf[0].item()), 4),
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
            }
        )

    return detections


def run_model_inference(
    image: np.ndarray,
    model_name: str,
    confidence_threshold: float,
    *,
    sequence_state=None,
) -> dict[str, object]:
    normalized_model_name = normalize_model_name(model_name)
    normalized_confidence = sanitize_confidence_threshold(confidence_threshold)
    model = _get_model_instance(normalized_model_name)

    if normalized_model_name == "violence":
        return run_violence_inference(
            model,
            image,
            normalized_confidence,
            sequence_state=sequence_state,
        )

    start_time = perf_counter()
    results = model.predict(
        source=image,
        imgsz=640,
        conf=normalized_confidence,
        verbose=False,
    )
    inference_time_ms = round((perf_counter() - start_time) * 1000, 2)

    detections = _serialize_detections(results[0])
    height, width = image.shape[:2]
    return {
        "model": normalized_model_name,
        "detections": detections,
        "inference_time_ms": inference_time_ms,
        "image_size": [width, height],
    }


@router.post("/weapon")
async def detect_weapon(
    image: UploadFile = File(...),
    confidence_threshold: float = Form(DEFAULT_CONFIDENCE),
):
    decoded_image = await _decode_upload_image(image)
    result = run_model_inference(decoded_image, "weapon", confidence_threshold)
    telegram_notifier.schedule_detection_alert(
        result,
        source="http /detect/weapon",
        filename=image.filename,
    )
    return result


@router.post("/smokefire")
async def detect_smokefire(
    image: UploadFile = File(...),
    confidence_threshold: float = Form(DEFAULT_CONFIDENCE),
):
    decoded_image = await _decode_upload_image(image)
    result = run_model_inference(decoded_image, "smokefire", confidence_threshold)
    telegram_notifier.schedule_detection_alert(
        result,
        source="http /detect/smokefire",
        filename=image.filename,
    )
    return result


@router.post("/violence")
async def detect_violence(
    image: UploadFile = File(...),
    confidence_threshold: float = Form(DEFAULT_CONFIDENCE),
):
    decoded_image = await _decode_upload_image(image)
    result = run_model_inference(decoded_image, "violence", confidence_threshold)
    telegram_notifier.schedule_detection_alert(
        result,
        source="http /detect/violence",
        filename=image.filename,
    )
    return result


@router.post("/annotated")
async def detect_annotated(
    image: UploadFile = File(...),
    model_name: str = Form(...),
    confidence_threshold: float = Form(DEFAULT_CONFIDENCE),
):
    decoded_image = await _decode_upload_image(image)
    result = run_model_inference(decoded_image, model_name, confidence_threshold)
    telegram_notifier.schedule_detection_alert(
        result,
        source="http /detect/annotated",
        filename=image.filename,
    )
    result["annotated_image_base64"] = draw_annotated_image_base64(
        image=decoded_image,
        detections=result["detections"],
        model_name=result["model"],
    )
    return result


@router.post("/batch")
async def detect_batch(
    images: list[UploadFile] = File(...),
    model_name: str = Form(...),
    confidence_threshold: float = Form(DEFAULT_CONFIDENCE),
    include_annotations: bool = Form(False),
):
    normalized_model_name = normalize_model_name(model_name)
    sequence_state = create_sequence_state() if normalized_model_name == "violence" else None

    if not images:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one image is required.",
        )

    if len(images) > MAX_BATCH_IMAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Batch detection supports up to {MAX_BATCH_IMAGES} images per request.",
        )

    results: list[dict[str, object]] = []
    for image in images:
        decoded_image = await _decode_upload_image(image)
        result = run_model_inference(
            decoded_image,
            normalized_model_name,
            confidence_threshold,
            sequence_state=sequence_state,
        )
        telegram_notifier.schedule_detection_alert(
            result,
            source="http /detect/batch",
            filename=image.filename,
        )
        if include_annotations:
            result["annotated_image_base64"] = draw_annotated_image_base64(
                image=decoded_image,
                detections=result["detections"],
                model_name=result["model"],
            )
        result["filename"] = image.filename
        results.append(result)

    return results

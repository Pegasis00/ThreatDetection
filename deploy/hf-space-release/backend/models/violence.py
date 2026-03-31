from __future__ import annotations

from collections import deque
from time import perf_counter
from typing import Any

import numpy as np

try:
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None

FRAME_HEIGHT = 96
FRAME_WIDTH = 96
SEQUENCE_LENGTH = 16


def create_sequence_state() -> deque[np.ndarray]:
    return deque(maxlen=SEQUENCE_LENGTH)


def _ensure_runtime_dependencies() -> None:
    if cv2 is None:
        raise RuntimeError("opencv-python is not installed.")


def preprocess_frame(frame: np.ndarray) -> np.ndarray:
    _ensure_runtime_dependencies()
    resized_frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))
    return resized_frame.astype("float32") / 255.0


def _build_sequence(
    processed_frame: np.ndarray,
    sequence_state: deque[np.ndarray] | None,
) -> tuple[np.ndarray, int]:
    if sequence_state is None:
        sequence_frames = [processed_frame] * SEQUENCE_LENGTH
        return np.expand_dims(np.asarray(sequence_frames, dtype=np.float32), axis=0), SEQUENCE_LENGTH

    sequence_state.append(processed_frame)
    buffered_frames = list(sequence_state)
    if len(buffered_frames) < SEQUENCE_LENGTH:
        buffered_frames.extend([buffered_frames[-1]] * (SEQUENCE_LENGTH - len(buffered_frames)))

    return np.expand_dims(np.asarray(buffered_frames, dtype=np.float32), axis=0), min(
        len(sequence_state),
        SEQUENCE_LENGTH,
    )


def _extract_scores(prediction: np.ndarray) -> tuple[str, float, float]:
    flattened = np.asarray(prediction, dtype=np.float32).reshape(-1)
    if flattened.size >= 2:
        nonviolence_score = float(flattened[0])
        violence_score = float(flattened[1])
    elif flattened.size == 1:
        violence_score = float(flattened[0])
        nonviolence_score = 1.0 - violence_score
    else:  # pragma: no cover
        raise ValueError("Violence model returned an empty prediction.")

    violence_score = min(max(violence_score, 0.0), 1.0)
    nonviolence_score = min(max(nonviolence_score, 0.0), 1.0)
    predicted_label = "violence" if violence_score >= nonviolence_score else "nonviolence"
    return predicted_label, nonviolence_score, violence_score


def run_violence_inference(
    model: Any,
    image: np.ndarray,
    confidence_threshold: float,
    *,
    sequence_state: deque[np.ndarray] | None = None,
) -> dict[str, object]:
    processed_frame = preprocess_frame(image)
    input_data, sequence_progress = _build_sequence(processed_frame, sequence_state)

    start_time = perf_counter()
    prediction = model.predict(input_data, verbose=0)
    inference_time_ms = round((perf_counter() - start_time) * 1000, 2)

    predicted_label, nonviolence_score, violence_score = _extract_scores(prediction)
    height, width = image.shape[:2]
    bbox = [0, 0, max(width - 1, 0), max(height - 1, 0)]
    detections = []
    if predicted_label == "violence" and violence_score >= confidence_threshold:
        detections.append(
            {
                "class": "violence",
                "confidence": round(violence_score, 4),
                "bbox": bbox,
            }
        )

    return {
        "model": "violence",
        "detections": detections,
        "inference_time_ms": inference_time_ms,
        "image_size": [width, height],
        "classification": {
            "label": predicted_label,
            "nonviolence_score": round(nonviolence_score, 4),
            "violence_score": round(violence_score, 4),
            "sequence_progress": sequence_progress,
            "sequence_length": SEQUENCE_LENGTH,
        },
    }

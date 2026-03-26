import base64

import numpy as np

try:
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None

WEAPON_COLOR = (0, 0, 255)
SMOKEFIRE_COLOR = (0, 140, 255)
TEXT_COLOR = (255, 255, 255)
FONT = cv2.FONT_HERSHEY_SIMPLEX if cv2 is not None else 0


def _resolve_color(model_name: str) -> tuple[int, int, int]:
    return WEAPON_COLOR if model_name == "weapon" else SMOKEFIRE_COLOR


def draw_annotated_image_base64(
    image: np.ndarray,
    detections: list[dict[str, object]],
    model_name: str,
) -> str:
    if cv2 is None:
        raise RuntimeError("opencv-python is not installed.")

    annotated = image.copy()
    color = _resolve_color(model_name)

    for detection in detections:
        x1, y1, x2, y2 = [int(value) for value in detection["bbox"]]
        confidence = float(detection["confidence"])
        label = f"{detection['class']} {confidence * 100:.0f}%"

        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

        (text_width, text_height), baseline = cv2.getTextSize(label, FONT, 0.55, 2)
        label_top = max(y1 - text_height - baseline - 10, 0)
        label_bottom = label_top + text_height + baseline + 10
        label_right = x1 + text_width + 12

        cv2.rectangle(
            annotated,
            (x1, label_top),
            (label_right, label_bottom),
            color,
            thickness=-1,
        )
        cv2.putText(
            annotated,
            label,
            (x1 + 6, label_bottom - baseline - 4),
            FONT,
            0.55,
            TEXT_COLOR,
            2,
            lineType=cv2.LINE_AA,
        )

    success, encoded = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    if not success:
        raise ValueError("Failed to encode annotated image.")

    return base64.b64encode(encoded.tobytes()).decode("utf-8")

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from time import monotonic
from typing import Any
from urllib import error, parse, request


def _read_bool_env(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name, "").strip().lower()
    if not raw_value:
        return default
    return raw_value in {"1", "true", "yes", "on"}


def _read_float_env(name: str, default: float, *, minimum: float = 0.0) -> float:
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return default

    try:
        parsed_value = float(raw_value)
    except ValueError:
        return default

    return max(parsed_value, minimum)


def _unique_labels(detections: list[dict[str, object]]) -> tuple[str, ...]:
    labels: list[str] = []
    seen: set[str] = set()

    for detection in detections:
        label = str(detection.get("class", "unknown")).strip().lower() or "unknown"
        if label in seen:
            continue
        seen.add(label)
        labels.append(label)

    return tuple(labels)


def _build_detection_summary(detections: list[dict[str, object]]) -> str:
    grouped: dict[str, dict[str, float]] = {}
    ordered_labels: list[str] = []

    for detection in detections:
        label = str(detection.get("class", "unknown")).strip().lower() or "unknown"
        confidence = float(detection.get("confidence", 0.0) or 0.0)
        if label not in grouped:
            grouped[label] = {"count": 0, "max_confidence": 0.0}
            ordered_labels.append(label)

        grouped[label]["count"] += 1
        grouped[label]["max_confidence"] = max(grouped[label]["max_confidence"], confidence)

    parts: list[str] = []
    for label in ordered_labels:
        stats = grouped[label]
        confidence_text = f"{round(stats['max_confidence'] * 100)}%"
        count = int(stats["count"])
        suffix = f" (x{count})" if count > 1 else ""
        parts.append(f"{label} {confidence_text}{suffix}")

    return ", ".join(parts)


@dataclass(frozen=True)
class AlertPayload:
    cooldown_key: str
    reserved_at: float
    model: str
    source: str
    detection_count: int
    summary: str
    max_confidence: float
    image_size: tuple[int, int] | None
    filename: str | None
    timestamp_utc: str


class TelegramNotifier:
    def __init__(self) -> None:
        self._lock = Lock()
        self._last_sent_at: dict[str, float] = {}

    def is_enabled(self) -> bool:
        return _read_bool_env("Pegasusxz_TELEGRAM_ENABLED", default=False)

    def get_status(self) -> dict[str, object]:
        bot_token = os.getenv("Pegasusxz_TELEGRAM_BOT_TOKEN", "").strip()
        chat_id = os.getenv("Pegasusxz_TELEGRAM_CHAT_ID", "").strip()
        return {
            "enabled": self.is_enabled(),
            "configured": bool(bot_token and chat_id),
            "cooldown_seconds": _read_float_env(
                "Pegasusxz_TELEGRAM_ALERT_COOLDOWN_SECONDS",
                30.0,
                minimum=0.0,
            ),
            "minimum_confidence": _read_float_env(
                "Pegasusxz_TELEGRAM_MIN_CONFIDENCE",
                0.0,
                minimum=0.0,
            ),
        }

    def prepare_detection_alert(
        self,
        result: dict[str, Any],
        *,
        source: str,
        filename: str | None = None,
    ) -> AlertPayload | None:
        if not self.is_enabled():
            return None

        bot_token = os.getenv("Pegasusxz_TELEGRAM_BOT_TOKEN", "").strip()
        chat_id = os.getenv("Pegasusxz_TELEGRAM_CHAT_ID", "").strip()
        if not bot_token or not chat_id:
            return None

        detections = list(result.get("detections") or [])
        if not detections:
            return None

        max_confidence = max(float(detection.get("confidence", 0.0) or 0.0) for detection in detections)
        min_confidence = _read_float_env("Pegasusxz_TELEGRAM_MIN_CONFIDENCE", 0.0, minimum=0.0)
        if max_confidence < min_confidence:
            return None

        model = str(result.get("model", "unknown")).strip().lower() or "unknown"
        labels = _unique_labels(detections)
        cooldown_key = f"{model}:{'|'.join(labels)}"
        cooldown_seconds = _read_float_env(
            "Pegasusxz_TELEGRAM_ALERT_COOLDOWN_SECONDS",
            30.0,
            minimum=0.0,
        )
        now = monotonic()

        with self._lock:
            last_sent_at = self._last_sent_at.get(cooldown_key)
            if last_sent_at is not None and cooldown_seconds > 0 and (now - last_sent_at) < cooldown_seconds:
                return None
            self._last_sent_at[cooldown_key] = now

        image_size = result.get("image_size")
        normalized_image_size: tuple[int, int] | None = None
        if isinstance(image_size, (list, tuple)) and len(image_size) >= 2:
            normalized_image_size = (int(image_size[0]), int(image_size[1]))

        return AlertPayload(
            cooldown_key=cooldown_key,
            reserved_at=now,
            model=model,
            source=source,
            detection_count=len(detections),
            summary=_build_detection_summary(detections),
            max_confidence=max_confidence,
            image_size=normalized_image_size,
            filename=filename,
            timestamp_utc=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        )

    async def send_prepared_alert(self, payload: AlertPayload) -> bool:
        bot_token = os.getenv("Pegasusxz_TELEGRAM_BOT_TOKEN", "").strip()
        chat_id = os.getenv("Pegasusxz_TELEGRAM_CHAT_ID", "").strip()
        if not bot_token or not chat_id:
            self._release_cooldown(payload)
            return False

        message = self._build_message(payload)

        try:
            await asyncio.to_thread(self._post_message, bot_token, chat_id, message)
            return True
        except Exception as exc:  # pragma: no cover
            print(f"Telegram alert failed: {exc}", flush=True)
            self._release_cooldown(payload)
            return False

    def schedule_detection_alert(
        self,
        result: dict[str, Any],
        *,
        source: str,
        filename: str | None = None,
    ) -> None:
        payload = self.prepare_detection_alert(result, source=source, filename=filename)
        if payload is None:
            return

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return

        loop.create_task(self.send_prepared_alert(payload))

    def _release_cooldown(self, payload: AlertPayload) -> None:
        with self._lock:
            if self._last_sent_at.get(payload.cooldown_key) == payload.reserved_at:
                self._last_sent_at.pop(payload.cooldown_key, None)

    def _build_message(self, payload: AlertPayload) -> str:
        lines = [
            "Pegasusxz threat warning",
            f"Source: {payload.source}",
            f"Model: {payload.model}",
            f"Matches: {payload.summary}",
            f"Detections: {payload.detection_count}",
            f"Top confidence: {round(payload.max_confidence * 100)}%",
        ]

        if payload.image_size:
            lines.append(f"Image size: {payload.image_size[0]}x{payload.image_size[1]}")
        if payload.filename:
            lines.append(f"File: {payload.filename}")

        lines.append(f"Time: {payload.timestamp_utc}")
        return "\n".join(lines)

    @staticmethod
    def _post_message(bot_token: str, chat_id: str, message: str) -> None:
        api_base = os.getenv("Pegasusxz_TELEGRAM_API_BASE", "https://api.telegram.org").strip().rstrip("/")
        url = f"{api_base}/bot{parse.quote(bot_token, safe='')}/sendMessage"
        body = parse.urlencode(
            {
                "chat_id": chat_id,
                "text": message,
                "disable_web_page_preview": "true",
            }
        ).encode("utf-8")
        http_request = request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )

        try:
            with request.urlopen(http_request, timeout=10) as response:
                response.read()
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Telegram API error {exc.code}: {detail}") from exc
        except error.URLError as exc:
            raise RuntimeError(f"Telegram API request failed: {exc.reason}") from exc


telegram_notifier = TelegramNotifier()

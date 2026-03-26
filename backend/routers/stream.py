import asyncio
from time import perf_counter

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status

try:
    from ..models.violence import create_sequence_state
    from .detect import (
        DEFAULT_CONFIDENCE,
        _read_int_env,
        decode_image_bytes,
        normalize_model_name,
        run_model_inference,
        sanitize_confidence_threshold,
    )
except ImportError:  # pragma: no cover
    from models.violence import create_sequence_state
    from routers.detect import (
        DEFAULT_CONFIDENCE,
        _read_int_env,
        decode_image_bytes,
        normalize_model_name,
        run_model_inference,
        sanitize_confidence_threshold,
    )

router = APIRouter(tags=["Streaming"])
MAX_STREAM_FRAME_BYTES = _read_int_env("Pegasusxz_MAX_STREAM_FRAME_BYTES", 3 * 1024 * 1024)


@router.websocket("/ws/stream/{model_name}")
async def stream_detections(
    websocket: WebSocket,
    model_name: str,
    confidence: float = Query(DEFAULT_CONFIDENCE),
):
    try:
        normalized_model_name = normalize_model_name(model_name)
        normalized_confidence = sanitize_confidence_threshold(confidence)
    except HTTPException as exc:
        await websocket.close(code=1008, reason=exc.detail)
        return

    await websocket.accept()

    latest_frame: bytes | None = None
    sequence_state = create_sequence_state() if normalized_model_name == "violence" else None
    frame_ready = asyncio.Event()
    disconnected = asyncio.Event()

    async def receiver() -> None:
        nonlocal latest_frame

        try:
            while True:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    break

                frame_bytes = message.get("bytes")
                if frame_bytes:
                    latest_frame = frame_bytes
                    frame_ready.set()
        except WebSocketDisconnect:
            pass
        finally:
            disconnected.set()
            frame_ready.set()

    async def processor() -> None:
        nonlocal latest_frame

        processed_frames = 0
        last_log_time = perf_counter()

        while True:
            await frame_ready.wait()
            frame_ready.clear()

            frame_bytes = latest_frame
            latest_frame = None

            if frame_bytes is None:
                if disconnected.is_set():
                    break
                continue

            try:
                decoded_image = decode_image_bytes(
                    frame_bytes,
                    max_bytes=MAX_STREAM_FRAME_BYTES,
                    source_name="stream frame",
                )
                result = run_model_inference(
                    decoded_image,
                    normalized_model_name,
                    normalized_confidence,
                    sequence_state=sequence_state,
                )
                await websocket.send_json(result)
                processed_frames += 1
            except HTTPException as exc:
                await websocket.send_json(
                    {
                        "model": normalized_model_name,
                        "error": exc.detail,
                        "status_code": exc.status_code,
                    }
                )
            except Exception as exc:  # pragma: no cover
                await websocket.send_json(
                    {
                        "model": normalized_model_name,
                        "error": str(exc),
                        "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
                    }
                )

            now = perf_counter()
            elapsed = now - last_log_time
            if elapsed >= 5:
                fps = processed_frames / elapsed if elapsed else 0.0
                print(f"[ws:{normalized_model_name}] {fps:.2f} FPS", flush=True)
                processed_frames = 0
                last_log_time = now

    receiver_task = asyncio.create_task(receiver())
    processor_task = asyncio.create_task(processor())

    try:
        await receiver_task
        await processor_task
    finally:
        for task in (receiver_task, processor_task):
            if not task.done():
                task.cancel()

        try:
            await websocket.close()
        except RuntimeError:
            pass

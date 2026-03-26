import argparse
import asyncio
from pathlib import Path

import cv2
import websockets


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simple WebSocket test client for /ws/stream/{model_name}.")
    parser.add_argument(
        "--model",
        choices=["weapon", "smokefire"],
        default="weapon",
        help="Model stream to test.",
    )
    parser.add_argument(
        "--image",
        required=True,
        help="Path to the image that will be encoded as JPEG and sent repeatedly.",
    )
    parser.add_argument(
        "--url",
        default="ws://127.0.0.1:8000",
        help="Base WebSocket URL for the backend.",
    )
    parser.add_argument(
        "--frames",
        type=int,
        default=5,
        help="Number of frames to send.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.2,
        help="Delay in seconds between sent frames.",
    )
    return parser.parse_args()


def load_frame_bytes(image_path: Path) -> bytes:
    frame = cv2.imread(str(image_path))
    if frame is None:
        raise FileNotFoundError(f"Unable to read image: {image_path}")

    encoded_ok, encoded_frame = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not encoded_ok:
        raise RuntimeError(f"Unable to encode image as JPEG: {image_path}")

    return encoded_frame.tobytes()


async def main() -> None:
    args = parse_args()
    image_path = Path(args.image).resolve()
    frame_bytes = load_frame_bytes(image_path)
    websocket_url = f"{args.url.rstrip('/')}/ws/stream/{args.model}"

    async with websockets.connect(websocket_url, max_size=4_000_000) as websocket:
        for frame_index in range(args.frames):
            await websocket.send(frame_bytes)
            response = await websocket.recv()
            print(f"frame {frame_index + 1}: {response}")
            await asyncio.sleep(args.delay)


if __name__ == "__main__":
    asyncio.run(main())

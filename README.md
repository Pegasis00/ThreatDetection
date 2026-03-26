# Pegasusxz - AI Surveillance Dashboard

Real-time threat and hazard detection with a FastAPI backend, YOLO models, and a React/Vite operator console.

## Stack

| Layer | Technology |
| --- | --- |
| Backend | FastAPI + Python 3.10+ |
| Models | Ultralytics YOLO |
| Image processing | OpenCV |
| Frontend | React 19 + Vite |
| Styling | CSS + Tailwind runtime import |
| Realtime | WebSocket streaming |

## Requirements

- Python 3.10+
- Node.js `^20.19.0 || >=22.12.0`

## Quick Start

### Windows One-Time Setup

```bat
setup-dev.bat
```

### Windows Run

```bat
run-dev.bat
```

This opens:

- backend: `http://localhost:8000`
- frontend: `http://localhost:3000`

### Manual Setup

If someone on the team prefers manual setup or is not on Windows:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

cd ../frontend
npm install
npm run dev
```

## Project Layout

```text
backend/
  main.py
  routers/
  models/
frontend/
  src/
  public/
README.md
```

## Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

Model files are auto-discovered from `backend/models/`:

- Weapon model: `weapon.pt` or `02032026.pt`
- Smoke/fire model: `smokefire.pt` or `firesmoke.pt`

The current repo already includes the `.pt` model files, so teammates do not need to download them separately after cloning.

You can also override paths with environment variables:

- `Pegasusxz_WEAPON_MODEL`
- `Pegasusxz_SMOKEFIRE_MODEL`

Start the backend:

```bash
uvicorn backend.main:app --reload --port 8000
```

If you run from inside `backend/`:

```bash
uvicorn main:app --reload --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

### Optional Backend Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `Pegasusxz_WEAPON_MODEL` | auto-detected | Absolute or relative path to the weapon model |
| `Pegasusxz_SMOKEFIRE_MODEL` | auto-detected | Absolute or relative path to the smoke/fire model |
| `Pegasusxz_CORS_ORIGINS` | `*` | Comma-separated CORS origins if you want to lock the API down |
| `Pegasusxz_MAX_UPLOAD_BYTES` | `8388608` | Max size for a single uploaded image in bytes |
| `Pegasusxz_MAX_BATCH_IMAGES` | `10` | Max images accepted by `/detect/batch` |
| `Pegasusxz_MAX_STREAM_FRAME_BYTES` | `3145728` | Max size for a streamed WebSocket frame in bytes |

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server runs on `http://localhost:3000`.

### Backend URL Resolution

The frontend now resolves the API URL in this order:

1. Saved Settings value (`Pegasusxz_api_url` in local storage)
2. `VITE_API_URL`
3. Current browser hostname on port `8000`

That means if you open the frontend from another device on your LAN, it will default to that same host instead of forcing `localhost`.

### Frontend Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | unset | Explicit backend base URL for deployed builds |
| `VITE_API_PORT` | `8000` | Port used when the frontend auto-detects a local backend |
| `VITE_API_TIMEOUT_MS` | `15000` | Request timeout for health and inference calls |

### Camera Note

Live camera capture usually requires `https://` or `localhost` in modern browsers. If you test the UI from another phone or laptop, use HTTPS for the frontend if camera access is blocked.

## API Reference

### `GET /health`

Returns dependency status and model load status.

### `POST /detect/weapon`

Multipart form fields:

- `image`
- `confidence_threshold`

### `POST /detect/smokefire`

Multipart form fields:

- `image`
- `confidence_threshold`

### `POST /detect/annotated`

Multipart form fields:

- `image`
- `model_name`
- `confidence_threshold`

Returns detection data plus `annotated_image_base64`.

### `POST /detect/batch`

Multipart form fields:

- `images`
- `model_name`
- `confidence_threshold`
- `include_annotations`

When `include_annotations=true`, each result may include `annotated_image_base64`.

### `WebSocket /ws/stream/{model_name}?confidence=0.25`

Send JPEG bytes as binary frames. The server returns JSON detection payloads for the selected model.

## Example cURL Commands

```bash
# Health
curl http://localhost:8000/health

# Weapon detection
curl -X POST http://localhost:8000/detect/weapon \
  -F "image=@test.jpg" \
  -F "confidence_threshold=0.25"

# Smoke/fire detection
curl -X POST http://localhost:8000/detect/smokefire \
  -F "image=@test.jpg"

# Annotated image
curl -X POST http://localhost:8000/detect/annotated \
  -F "image=@test.jpg" \
  -F "model_name=weapon" \
  -F "confidence_threshold=0.25"

# Batch with annotations
curl -X POST http://localhost:8000/detect/batch \
  -F "images=@frame1.jpg" \
  -F "images=@frame2.jpg" \
  -F "model_name=smokefire" \
  -F "include_annotations=true"
```

## WebSocket Test Client

```bash
python backend/test_ws_client.py --model weapon --image test.jpg --frames 5
```

## Frontend Pages

| Route | Purpose |
| --- | --- |
| `/` | Overview, model health, and detection history |
| `/image-test` | Single-image annotated inference |
| `/live-feed` | Camera streaming with live detections |
| `/video-test` | Batch frame extraction and timeline review |
| `/settings` | API URL, defaults, and local history controls |

## Deployment Notes

### Backend on Render

- `render.yaml` is included for the FastAPI service.
- Set `Pegasusxz_CORS_ORIGINS` to your deployed frontend origin instead of leaving it wide open.
- Make sure the model files are present inside `backend/models/` or provide explicit absolute paths with environment variables.

### Frontend on Vercel

- Deploy the `frontend/` directory as the project root.
- `frontend/vercel.json` includes an SPA rewrite so direct visits to `/image-test`, `/live-feed`, and other routes do not 404.
- Set `VITE_API_URL` to your backend URL before building.
- If you deploy the frontend on another static host, add the same catch-all rewrite to `index.html`.

### Production Checklist

- Copy `backend/.env.example` and `frontend/.env.example` into real environment variables on your host.
- Confirm `/health` reports both models as loaded after deploy.
- Test camera access over HTTPS if you plan to use the live feed outside localhost.
- Keep `frontend/node_modules`, `frontend/dist`, and local logs out of version control using the included `.gitignore`.

## GitHub Readiness

- The model files currently in `backend/models/` are below GitHub's 100 MB per-file limit, so they can be committed directly.
- Teammates will still need Python and Node installed locally before running the setup script.
- The heaviest first-time step is `pip install -r backend/requirements.txt` because `ultralytics` pulls large ML dependencies.

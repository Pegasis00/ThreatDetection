import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from .models import loader
    from .routers.detect import router as detect_router
    from .routers.stream import router as stream_router
except ImportError:  # pragma: no cover
    from models import loader
    from routers.detect import router as detect_router
    from routers.stream import router as stream_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    loader.load_models()
    yield


def _get_allowed_origins() -> list[str]:
    configured = os.getenv("Pegasusxz_CORS_ORIGINS", "").strip()
    if not configured:
        return ["*"]

    origins = [origin.strip() for origin in configured.split(",") if origin.strip()]
    return origins or ["*"]


app = FastAPI(
    title="Pegasusxz AI Surveillance Backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_allowed_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(detect_router)
app.include_router(stream_router)


@app.get("/")
async def root():
    return {
        "name": "Pegasusxz AI Surveillance Backend",
        "status": "online",
        "health_path": "/health",
    }


@app.get("/health")
async def health_check():
    return {
        "name": "Pegasusxz AI Surveillance Backend",
        "version": app.version,
        **loader.get_model_status(),
    }

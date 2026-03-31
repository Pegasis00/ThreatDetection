---
title: Pegasusxz Backend
emoji: "🛡️"
colorFrom: blue
colorTo: gray
sdk: docker
app_port: 7860
suggested_hardware: cpu-basic
---

# Pegasusxz Backend

FastAPI backend for threat, hazard, and violence detection.

## Included Models

- Weapon detection: Ultralytics YOLO
- Smoke/fire detection: Ultralytics YOLO
- Violence detection: TensorFlow/Keras

## Health Check

Open `/health` after the Space boots to confirm all three models loaded correctly.

## Space Variables

Optional variables:

- `Pegasusxz_CORS_ORIGINS`
- `Pegasusxz_WEAPON_MODEL`
- `Pegasusxz_SMOKEFIRE_MODEL`
- `Pegasusxz_VIOLENCE_MODEL`

The current repo layout already auto-discovers the bundled model files, so only `Pegasusxz_CORS_ORIGINS` is commonly needed.

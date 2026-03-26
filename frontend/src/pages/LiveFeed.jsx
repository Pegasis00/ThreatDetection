import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import {
  getSelectionDisplayLabel,
  getModelTone,
  hasSelectedModels,
  isMultiModelSelection,
  MODEL_META,
  SINGLE_MODELS,
  toggleModelSelection,
} from '../utils/models';
import {
  addDetectionHistoryEntries,
  createClientId,
  readDefaultModelSelection,
  readLiveConfidence,
  writeLiveConfidence,
} from '../utils/runtime';

const OVERLAY_TTL_MS = 1500;
const LOCAL_SINGLE_MODEL_STREAM_INTERVAL_MS = 140;
const LOCAL_MULTI_MODEL_STREAM_INTERVAL_MS = 240;
const LOCAL_VIOLENCE_STREAM_INTERVAL_MS = 450;
const REMOTE_STREAM_MAX_WIDTH = 416;
const SINGLE_MODEL_STREAM_INTERVAL_MS = 500;
const MULTI_MODEL_STREAM_INTERVAL_MS = 900;
const VIOLENCE_STREAM_INTERVAL_MS = 1400;
const LOCAL_STREAM_JPEG_QUALITY = 0.9;
const REMOTE_STREAM_JPEG_QUALITY = 0.55;

function getUploadWidth(activeModels) {
  if (activeModels.includes('violence')) {
    return REMOTE_STREAM_MAX_WIDTH;
  }

  if (activeModels.length > 1) {
    return 512;
  }

  return REMOTE_STREAM_MAX_WIDTH;
}

function getStreamInterval(activeModels, isLocalhost) {
  if (isLocalhost) {
    if (activeModels.includes('violence')) {
      return LOCAL_VIOLENCE_STREAM_INTERVAL_MS;
    }

    if (activeModels.length > 1) {
      return LOCAL_MULTI_MODEL_STREAM_INTERVAL_MS;
    }

    return LOCAL_SINGLE_MODEL_STREAM_INTERVAL_MS;
  }

  if (activeModels.includes('violence')) {
    return VIOLENCE_STREAM_INTERVAL_MS;
  }

  if (activeModels.length > 1) {
    return MULTI_MODEL_STREAM_INTERVAL_MS;
  }

  return SINGLE_MODEL_STREAM_INTERVAL_MS;
}

function getStreamJpegQuality(isLocalhost) {
  return isLocalhost ? LOCAL_STREAM_JPEG_QUALITY : REMOTE_STREAM_JPEG_QUALITY;
}

function getAudioContextCtor() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.AudioContext || window.webkitAudioContext || null;
}

function createEmptyDetectionState() {
  return Object.fromEntries(
    SINGLE_MODELS.map((model) => [model, { detections: [], inference: null, imageSize: null, timestamp: 0 }]),
  );
}

function createEmptyInferenceState() {
  return Object.fromEntries(SINGLE_MODELS.map((model) => [model, null]));
}

function getAlertType(activeModels, detectionState) {
  if (activeModels.some((model) => getModelTone(model) === 'danger' && detectionState[model].detections.length)) {
    return 'danger';
  }
  if (activeModels.some((model) => getModelTone(model) === 'warning' && detectionState[model].detections.length)) {
    return 'warning';
  }

  return null;
}

export default function LiveFeed() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const uploadCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastSendRef = useRef(0);
  const uploadInFlightRef = useRef(false);
  const beepCooldownRef = useRef(0);
  const fpsTrackerRef = useRef({ frames: 0, lastTime: 0 });
  const audioContextRef = useRef(null);
  const latestDetectionsRef = useRef(createEmptyDetectionState());
  const activeRef = useRef(false);

  const [selectedModels, setSelectedModels] = useState(readDefaultModelSelection());
  const [confidence, setConfidence] = useState(readLiveConfidence());
  const [active, setActive] = useState(false);
  const [fps, setFps] = useState(0);
  const [latestInferenceMs, setLatestInferenceMs] = useState(createEmptyInferenceState);
  const [detectionCount, setDetectionCount] = useState(0);
  const [alertType, setAlertType] = useState(null);
  const [log, setLog] = useState([]);
  const [cameraError, setCameraError] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [previewAspectRatio, setPreviewAspectRatio] = useState(4 / 3);

  const activeModels = useMemo(() => selectedModels, [selectedModels]);
  const secureContext = useMemo(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    return window.isSecureContext || window.location.hostname === 'localhost';
  }, []);
  const isLocalhost = useMemo(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    return ['localhost', '127.0.0.1'].includes(window.location.hostname);
  }, []);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const ensureAudioContext = useCallback(async () => {
    const AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }

    if (audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch {
        return audioContextRef.current;
      }
    }

    return audioContextRef.current;
  }, []);

  const playBeep = useCallback((frequency) => {
    const context = audioContextRef.current;
    if (!context) {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.22, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.16);
  }, []);

  const handleDetection = useCallback((payload) => {
    if (!activeRef.current || !payload || payload.error) {
      return;
    }

    const detections = payload.detections || [];
    latestDetectionsRef.current[payload.model] = {
      detections,
      inference: payload.inference_time_ms ?? null,
      imageSize: payload.image_size ?? null,
      timestamp: performance.now(),
    };

    setLatestInferenceMs((current) => ({
      ...current,
      [payload.model]: payload.inference_time_ms ?? null,
    }));

    const combinedActiveDetections = activeModels.flatMap(
      (activeModel) => latestDetectionsRef.current[activeModel].detections,
    );
    setDetectionCount(combinedActiveDetections.length);
    setAlertType(getAlertType(activeModels, latestDetectionsRef.current));

    if (!detections.length) {
      return;
    }

    const now = Date.now();
    if (now - beepCooldownRef.current > 3000) {
      beepCooldownRef.current = now;
      playBeep(MODEL_META[payload.model].beep);
    }

    const timestamp = new Date().toISOString();
    addDetectionHistoryEntries(
      detections.map((detection) => ({
        id: createClientId(),
        timestamp,
        model: payload.model,
        class: detection.class,
        confidence: detection.confidence,
        bbox: detection.bbox,
        inferenceMs: payload.inference_time_ms,
      })),
    );

    setLog((entries) => [
      {
        id: createClientId(),
        model: payload.model,
        summary: detections.map((detection) => detection.class).join(', '),
        confidence: Math.round((detections[0]?.confidence || 0) * 100),
        timestamp: new Date(timestamp).toLocaleTimeString(),
      },
      ...entries.slice(0, 23),
    ]);
  }, [activeModels, playBeep]);

  const {
    connect: connectWeapon,
    connected: weaponConnected,
    disconnect: disconnectWeapon,
    error: weaponError,
    sendFrame: sendWeaponFrame,
  } = useWebSocket('weapon', confidence, handleDetection);
  const {
    connect: connectHazard,
    connected: hazardConnected,
    disconnect: disconnectHazard,
    error: hazardError,
    sendFrame: sendHazardFrame,
  } = useWebSocket('smokefire', confidence, handleDetection);
  const {
    connect: connectViolence,
    connected: violenceConnected,
    disconnect: disconnectViolence,
    error: violenceError,
    sendFrame: sendViolenceFrame,
  } = useWebSocket('violence', confidence, handleDetection);

  const connectedCount = [
    activeModels.includes('weapon') && weaponConnected,
    activeModels.includes('smokefire') && hazardConnected,
    activeModels.includes('violence') && violenceConnected,
  ].filter(Boolean).length;
  const connected = activeModels.length > 0 && connectedCount === activeModels.length;
  const wsError = [
    activeModels.includes('weapon') ? weaponError : null,
    activeModels.includes('smokefire') ? hazardError : null,
    activeModels.includes('violence') ? violenceError : null,
  ]
    .filter(Boolean)
    .join(' | ');

  useEffect(() => {
    const visibleDetections = activeModels.flatMap(
      (activeModel) => latestDetectionsRef.current[activeModel].detections,
    );
    setDetectionCount(visibleDetections.length);
    setAlertType(getAlertType(activeModels, latestDetectionsRef.current));
  }, [activeModels]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const now = performance.now();
      let changed = false;

      SINGLE_MODELS.forEach((model) => {
        const entry = latestDetectionsRef.current[model];
        if (entry.detections.length && now - entry.timestamp >= OVERLAY_TTL_MS) {
          latestDetectionsRef.current[model] = {
            ...entry,
            detections: [],
          };
          changed = true;
        }
      });

      if (!changed) {
        return;
      }

      const visibleDetections = activeModels.flatMap(
        (activeModel) => latestDetectionsRef.current[activeModel].detections,
      );
      setDetectionCount(visibleDetections.length);
      setAlertType(getAlertType(activeModels, latestDetectionsRef.current));
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [active, activeModels]);

  const refreshCameras = useCallback(async (requestPermission = false) => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setCameraError('This browser cannot enumerate camera devices.');
      return;
    }

    let permissionStream = null;

    try {
      if (requestPermission && navigator.mediaDevices.getUserMedia) {
        permissionStream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === 'videoinput');
      setCameras(videoDevices);

      if (videoDevices.length && !selectedCamera) {
        setSelectedCamera(videoDevices[0].deviceId);
      }
    } catch (error) {
      setCameraError(error.message || 'Unable to inspect connected cameras.');
    } finally {
      permissionStream?.getTracks().forEach((track) => track.stop());
    }
  }, [selectedCamera]);

  useEffect(() => {
    refreshCameras();
  }, [refreshCameras]);

  useEffect(() => {
    if (!active) {
      disconnectWeapon();
      disconnectHazard();
      disconnectViolence();
      return undefined;
    }

    if (activeModels.includes('weapon')) {
      connectWeapon();
    } else {
      disconnectWeapon();
    }

    if (activeModels.includes('smokefire')) {
      connectHazard();
    } else {
      disconnectHazard();
    }

    if (activeModels.includes('violence')) {
      connectViolence();
    } else {
      disconnectViolence();
    }

    return () => {
      disconnectWeapon();
      disconnectHazard();
      disconnectViolence();
    };
  }, [
    active,
    activeModels,
    connectHazard,
    connectViolence,
    connectWeapon,
    disconnectHazard,
    disconnectViolence,
    disconnectWeapon,
  ]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    fpsTrackerRef.current = { frames: 0, lastTime: performance.now() };

    const drawFrame = () => {
      animationRef.current = window.requestAnimationFrame(drawFrame);

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        return;
      }

      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const nextAspectRatio = width / Math.max(height, 1);
      setPreviewAspectRatio((current) =>
        Math.abs(current - nextAspectRatio) > 0.01 ? nextAspectRatio : current,
      );
      if (canvas.width !== width) {
        canvas.width = width;
      }
      if (canvas.height !== height) {
        canvas.height = height;
      }

      context.drawImage(video, 0, 0, width, height);
      context.lineWidth = 2;
      context.font = '600 13px "Consolas", monospace';

      activeModels.forEach((activeModel) => {
        const entry = latestDetectionsRef.current[activeModel];
        const overlayAge = performance.now() - entry.timestamp;

        if (overlayAge >= OVERLAY_TTL_MS || !entry.detections.length) {
          return;
        }

        const overlayAlpha = Math.max(0, 1 - overlayAge / OVERLAY_TTL_MS);
        const tone = MODEL_META[activeModel].canvasTone;
        const [sourceWidth, sourceHeight] = entry.imageSize || [width, height];
        const scaleX = sourceWidth ? width / sourceWidth : 1;
        const scaleY = sourceHeight ? height / sourceHeight : 1;
        context.globalAlpha = overlayAlpha;

        entry.detections.forEach((detection) => {
          const [rawX1, rawY1, rawX2, rawY2] = detection.bbox || [0, 0, 0, 0];
          const x1 = rawX1 * scaleX;
          const y1 = rawY1 * scaleY;
          const x2 = rawX2 * scaleX;
          const y2 = rawY2 * scaleY;
          const prefix = isMultiModelSelection(selectedModels) ? `${MODEL_META[activeModel].label.toUpperCase()} ` : '';
          const label = `${prefix}${String(detection.class || 'target').toUpperCase()} ${Math.round((detection.confidence || 0) * 100)}%`;
          const labelWidth = context.measureText(label).width + 18;

          context.strokeStyle = tone;
          context.strokeRect(x1, y1, x2 - x1, y2 - y1);
          context.fillStyle = tone;
          context.fillRect(x1, Math.max(0, y1 - 26), labelWidth, 22);
          context.fillStyle = '#0b1015';
          context.fillText(label, x1 + 8, Math.max(14, y1 - 10));
        });
      });

      context.globalAlpha = 1;

      frameCountRef.current += 1;
      const now = performance.now();
      const streamInterval = getStreamInterval(activeModels, isLocalhost);
      if (!uploadInFlightRef.current && now - lastSendRef.current >= streamInterval) {
        lastSendRef.current = now;
        uploadInFlightRef.current = true;
        const sourceCanvas = isLocalhost ? canvas : uploadCanvasRef.current || document.createElement('canvas');
        if (!isLocalhost) {
          if (!uploadCanvasRef.current) {
            uploadCanvasRef.current = sourceCanvas;
          }

          const uploadWidth = Math.min(getUploadWidth(activeModels), width);
          const uploadHeight = Math.max(1, Math.round((height / width) * uploadWidth));
          sourceCanvas.width = uploadWidth;
          sourceCanvas.height = uploadHeight;

          const uploadContext = sourceCanvas.getContext('2d');
          if (!uploadContext) {
            uploadInFlightRef.current = false;
            return;
          }

          uploadContext.drawImage(video, 0, 0, uploadWidth, uploadHeight);
        }

        sourceCanvas.toBlob((blob) => {
          if (!blob) {
            uploadInFlightRef.current = false;
            return;
          }

          blob.arrayBuffer().then((buffer) => {
            let sent = false;
            if (activeModels.includes('weapon')) {
              sent = sendWeaponFrame(buffer) || sent;
            }
            if (activeModels.includes('smokefire')) {
              sent = sendHazardFrame(buffer) || sent;
            }
            if (activeModels.includes('violence')) {
              sent = sendViolenceFrame(buffer) || sent;
            }
            if (!sent) {
              lastSendRef.current = 0;
            }
          }).catch(() => {
            lastSendRef.current = 0;
          }).finally(() => {
            uploadInFlightRef.current = false;
          });
        }, 'image/jpeg', getStreamJpegQuality(isLocalhost));
      }

      fpsTrackerRef.current.frames += 1;
      if (now - fpsTrackerRef.current.lastTime >= 1000) {
        setFps(fpsTrackerRef.current.frames);
        fpsTrackerRef.current = { frames: 0, lastTime: now };
      }
    };

    animationRef.current = window.requestAnimationFrame(drawFrame);

    return () => {
      window.cancelAnimationFrame(animationRef.current);
    };
  }, [
    active,
    activeModels,
    selectedModels,
    sendHazardFrame,
    isLocalhost,
    sendViolenceFrame,
    sendWeaponFrame,
  ]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function startFeed() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera capture is not supported in this browser.');
      return;
    }

    setCameraError(null);

    try {
      if (!hasSelectedModels(selectedModels)) {
        setCameraError('Select at least one model before starting the live feed.');
        return;
      }

      await ensureAudioContext();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      latestDetectionsRef.current = createEmptyDetectionState();
      setLatestInferenceMs(createEmptyInferenceState());
      setDetectionCount(0);
      setAlertType(null);
      setLog([]);
      frameCountRef.current = 0;
      lastSendRef.current = 0;
      uploadInFlightRef.current = false;

      const constraints = {
        video: selectedCamera
          ? {
              deviceId: { exact: selectedCamera },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setActive(true);
      await refreshCameras();
    } catch (error) {
      const name = error.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setCameraError('No camera was found on this device.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setCameraError('The camera is already busy in another application.');
      } else {
        setCameraError(error.message || 'Unable to start the camera feed.');
      }
    }
  }

  function stopFeed() {
    setActive(false);
    setAlertType(null);
    setDetectionCount(0);
    setFps(0);
    setLatestInferenceMs(createEmptyInferenceState());
    setLog([]);
    latestDetectionsRef.current = createEmptyDetectionState();
    frameCountRef.current = 0;
    lastSendRef.current = 0;
    uploadInFlightRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      context?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function captureFrame() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `Pegasusxz_capture_${Date.now()}.png`;
    link.click();
  }

  const latestInferenceLabel =
    activeModels
      .map((activeModel) =>
        latestInferenceMs[activeModel] != null ? `${MODEL_META[activeModel].label} ${latestInferenceMs[activeModel]} ms` : null,
      )
      .filter(Boolean)
      .join(' / ') || 'n/a';

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Watch the camera feed and catch detections in real time.</h1>
          <p className="page-copy">
            Run one model or stack multiple engines, without leaving the stream.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-secondary" onClick={() => refreshCameras(true)}>
            Refresh cameras
          </button>
          <button
            type="button"
            className={`btn ${active ? 'btn-danger' : 'btn-primary'}`}
            onClick={active ? stopFeed : startFeed}
            disabled={!active && !hasSelectedModels(selectedModels)}
          >
            {active ? 'Stop live feed' : 'Start live feed'}
          </button>
        </div>
      </header>

      {!secureContext ? (
        <div className="notice notice-warning">
          Mobile browsers usually require HTTPS for camera access. If this page is open on another device over plain
          HTTP, the live feed may be blocked even if the service itself is reachable.
        </div>
      ) : null}

      {cameraError ? <div className="notice notice-error">{cameraError}</div> : null}
      {wsError ? <div className="notice notice-error">{wsError}</div> : null}

      <section className="workspace-grid workspace-grid--wide">
        <article className={`surface feed-panel ${alertType ? `feed-panel--${alertType}` : ''}`}>
          <div className="feed-stage" style={{ aspectRatio: previewAspectRatio }}>
            <video ref={videoRef} className="feed-video" muted playsInline />
            <canvas ref={canvasRef} className="feed-canvas" />

            {!active ? (
              <div className="feed-stage__empty">
                <strong>Feed offline</strong>
                <span>Start the camera to begin streaming frames for analysis.</span>
              </div>
            ) : null}

            <div className="feed-hud feed-hud--left">
              <span className={`status-pill ${connected ? 'is-online' : 'is-offline'}`}>
                <span className="status-pill__dot" />
                {isMultiModelSelection(selectedModels) ? `${connectedCount}/${activeModels.length} linked` : connected ? 'streaming' : 'connecting'}
              </span>
              <span className="status-pill">
                <span className="status-pill__dot" />
                {fps} fps
              </span>
            </div>

            <div className="feed-hud feed-hud--right">
              <span className={`status-pill ${alertType === 'danger' ? 'is-danger' : alertType === 'warning' ? 'is-warning' : ''}`}>
                <span className="status-pill__dot" />
                {detectionCount ? `${detectionCount} detections` : 'clear'}
              </span>
            </div>
          </div>

          <div className="feed-footer">
            <div className="result-meta">
              <div>
                <span>Models</span>
                <strong>{getSelectionDisplayLabel(selectedModels)}</strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong>{confidence.toFixed(2)}</strong>
              </div>
              <div>
                <span>Last inference</span>
                <strong>{latestInferenceLabel}</strong>
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={captureFrame} disabled={!active}>
              Capture frame
            </button>
          </div>
        </article>

        <div className="workspace-column">
          <article className="surface section-card">
            <div className="section-card__header">
              <div>
                <p className="section-card__kicker">Camera</p>
                <h2>Select a capture device</h2>
              </div>
            </div>

            {cameras.length ? (
              <select
                className="select-input"
                value={selectedCamera}
                onChange={(event) => setSelectedCamera(event.target.value)}
                disabled={active}
              >
                {cameras.map((camera, index) => (
                  <option key={camera.deviceId || index} value={camera.deviceId}>
                    {camera.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
            ) : (
              <div className="empty-inline">No cameras listed yet. Refresh devices to request permission.</div>
            )}
          </article>

          <article className="surface section-card">
            <div className="section-card__header">
              <div>
                <p className="section-card__kicker">Scan</p>
                <h2>Choose mode and threshold</h2>
              </div>
            </div>

            <div className="toggle-row toggle-row--triple">
              {SINGLE_MODELS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`toggle-button ${selectedModels.includes(option) ? 'is-active' : ''}`}
                  onClick={() => setSelectedModels((current) => toggleModelSelection(current, option))}
                >
                  {MODEL_META[option].buttonLabel}
                </button>
              ))}
            </div>

            {!hasSelectedModels(selectedModels) ? (
              <div className="notice notice-warning">Select at least one model to stream detections.</div>
            ) : null}

            <label className="field-group">
              <div className="field-group__label-row">
                <span>Confidence threshold</span>
                <strong>{confidence.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.95"
                step="0.05"
                className="range-input"
                value={confidence}
                onChange={(event) => {
                  const nextValue = Number.parseFloat(event.target.value);
                  setConfidence(nextValue);
                  writeLiveConfidence(nextValue);
                }}
              />
            </label>
          </article>

          <article className="surface result-panel">
            <div className="section-header">
              <div>
                <h2 className="section-title">Recent events</h2>
              </div>
              <p className="muted-copy">{log.length} entries</p>
            </div>

            {log.length ? (
              <div className="stack-list">
                {log.map((entry) => (
                  <div key={entry.id} className="timeline-list-item timeline-list-item--static">
                    <div>
                      <strong>{MODEL_META[entry.model].label}: {entry.summary}</strong>
                      <span>{entry.timestamp}</span>
                    </div>
                    <span>{entry.confidence}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state empty-state--short">
                <strong>Awaiting detections</strong>
                <span>New events will appear here as soon as the stream returns a positive result.</span>
              </div>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}

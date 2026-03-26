import { useCallback, useEffect, useRef, useState } from 'react';
import { detectBatch } from '../utils/api';
import {
  addDetectionHistoryEntries,
  createClientId,
  readDefaultConfidence,
  readDefaultModel,
} from '../utils/runtime';

const MODEL_META = {
  smokefire: { label: 'Hazard' },
  weapon: { label: 'Threat' },
};

function extractFrame(video, time) {
  return new Promise((resolve, reject) => {
    const handleSeeked = () => {
      video.removeEventListener('seeked', handleSeeked);

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Could not read the video frame.'));
        return;
      }

      context.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Could not encode the extracted frame.'));
          return;
        }

        resolve({ blob, time });
      }, 'image/jpeg', 0.82);
    };

    video.addEventListener('seeked', handleSeeked, { once: true });
    video.currentTime = time;
  });
}

function resultTone(detections) {
  return detections.some((item) => item.model === 'weapon' || item.class === 'gun' || item.class === 'knife')
    ? 'danger'
    : 'warning';
}

function combineFrameResults(weaponResult, smokefireResult) {
  return {
    detections: [
      ...(weaponResult.detections || []).map((detection) => ({ ...detection, model: 'weapon' })),
      ...(smokefireResult.detections || []).map((detection) => ({ ...detection, model: 'smokefire' })),
    ],
    image_size: weaponResult.image_size || smokefireResult.image_size,
    inference_time_ms: Number(
      ((weaponResult.inference_time_ms || 0) + (smokefireResult.inference_time_ms || 0)).toFixed(2),
    ),
    mode: 'both',
    results: [
      { ...weaponResult, mode: 'single' },
      { ...smokefireResult, mode: 'single' },
    ],
  };
}

function buildDetectionSummary(frame) {
  return (frame.detections || [])
    .map((detection) =>
      frame.mode === 'both'
        ? `${detection.model === 'weapon' ? 'T' : 'H'}:${detection.class}`
        : detection.class,
    )
    .join(', ');
}

export default function VideoTest() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);
  const [model, setModel] = useState(readDefaultModel());
  const [confidence, setConfidence] = useState(readDefaultConfidence());
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [selectedFrame, setSelectedFrame] = useState(null);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!videoFile) {
      setVideoUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(videoFile);
    setVideoUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [videoFile]);

  const detectionFrames = results.filter((entry) => entry.detections?.length);

  const processVideo = useCallback(async () => {
    if (!videoRef.current || !videoFile) {
      return;
    }

    const video = videoRef.current;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;

    if (!duration) {
      setError('Video metadata has not loaded yet.');
      return;
    }

    setProcessing(true);
    setProgress(0);
    setResults([]);
    setSelectedFrame(null);
    setError(null);

    const timestamps = [];
    for (let second = 0; second < duration; second += 1) {
      timestamps.push(Math.min(second, Math.max(duration - 0.1, 0)));
    }

    const batchSize = 5;
    const collected = [];

    try {
      for (let index = 0; index < timestamps.length; index += batchSize) {
        const batchTimes = timestamps.slice(index, index + batchSize);
        const frames = [];

        for (const time of batchTimes) {
          const frame = await extractFrame(video, time);
          frames.push(frame);
        }

        const files = frames.map(({ blob, time }) => new File([blob], `frame_${time.toFixed(1)}s.jpg`, { type: 'image/jpeg' }));

        if (model === 'both') {
          const [weaponResponse, smokefireResponse] = await Promise.all([
            detectBatch(files, 'weapon', confidence, true),
            detectBatch(files, 'smokefire', confidence, true),
          ]);

          frames.forEach((frame, frameIndex) => {
            collected.push({
              ...combineFrameResults(weaponResponse[frameIndex], smokefireResponse[frameIndex]),
              filename: files[frameIndex].name,
              time: frame.time,
            });
          });
        } else {
          const response = await detectBatch(files, model, confidence, true);
          response.forEach((result, responseIndex) => {
            collected.push({
              mode: 'single',
              time: frames[responseIndex].time,
              ...result,
            });
          });
        }

        setProgress(Math.round(((index + batchTimes.length) / timestamps.length) * 100));
      }

      const orderedResults = collected.sort((a, b) => a.time - b.time);
      addDetectionHistoryEntries(
        orderedResults.flatMap((entry) =>
          entry.mode === 'both'
            ? entry.results.flatMap((result) =>
                (result.detections || []).map((detection) => ({
                  bbox: detection.bbox,
                  class: detection.class,
                  confidence: detection.confidence,
                  id: createClientId(),
                  inferenceMs: result.inference_time_ms,
                  model: result.model,
                  timestamp: new Date().toISOString(),
                })),
              )
            : (entry.detections || []).map((detection) => ({
                bbox: detection.bbox,
                class: detection.class,
                confidence: detection.confidence,
                id: createClientId(),
                inferenceMs: entry.inference_time_ms,
                model: entry.model,
                timestamp: new Date().toISOString(),
              })),
        ),
      );
      setResults(orderedResults);
      setSelectedFrame(orderedResults.find((entry) => entry.detections?.length) || orderedResults[0] || null);
    } catch (processingError) {
      setError(processingError.message || 'Video processing failed.');
    } finally {
      setProcessing(false);
    }
  }, [confidence, model, videoFile]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Sample the video, batch the frames, and inspect where detections appear over time.</h1>
          <p className="page-copy">
            Run one model or both together, then jump to the exact frames that triggered a hit.
          </p>
        </div>
      </header>

      <section className="surface section-card">
        <div className="section-card__header">
          <div>
            <p className="section-card__kicker">Video</p>
            <h2>Choose footage and scan mode</h2>
          </div>
        </div>

        <div className="controls-grid">
          <div className="field-group">
            <div className="field-group__label-row">
              <span>Source video</span>
            </div>
            <button type="button" className="upload-inline" onClick={() => inputRef.current?.click()}>
              {videoFile ? videoFile.name : 'Select a local video file'}
            </button>
            <input
              ref={inputRef}
              hidden
              type="file"
              accept="video/*"
              onChange={(event) => {
                const nextFile = event.target.files?.[0];
                setVideoFile(nextFile || null);
                setResults([]);
                setSelectedFrame(null);
                setError(null);
              }}
            />
          </div>

          <div className="field-group">
            <div className="field-group__label-row">
              <span>Mode</span>
            </div>
            <div className="toggle-row toggle-row--triple">
              {['weapon', 'smokefire', 'both'].map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`toggle-button ${model === option ? 'is-active' : ''}`}
                  onClick={() => setModel(option)}
                  disabled={processing}
                >
                  {option === 'weapon' ? 'Threat' : option === 'smokefire' ? 'Hazard' : 'Both'}
                </button>
              ))}
            </div>
          </div>

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
              value={confidence}
              className="range-input"
              onChange={(event) => setConfidence(Number.parseFloat(event.target.value))}
              disabled={processing}
            />
          </label>
        </div>

        {videoUrl ? (
          <video
            ref={videoRef}
            className="video-preview"
            src={videoUrl}
            controls
            preload="metadata"
            onLoadedMetadata={(event) => setVideoDuration(event.currentTarget.duration)}
          />
        ) : null}

        {processing ? (
          <div className="progress-block">
            <div className="field-group__label-row">
              <span>Processing progress</span>
              <strong>{progress}%</strong>
            </div>
            <div className="progress-bar">
              <div className="progress-bar__fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}

        <button type="button" className="btn btn-primary" onClick={processVideo} disabled={!videoFile || processing}>
          {processing ? 'Processing video...' : model === 'both' ? 'Run both models' : 'Run video scan'}
        </button>

        {error ? <div className="notice notice-error">{error}</div> : null}
      </section>

      <section className="workspace-grid">
        <article className="surface result-panel">
          <div className="section-header">
            <div>
              <h2 className="section-title">Timeline</h2>
            </div>
            <p className="muted-copy">
              {detectionFrames.length} positive frames across {Math.round(videoDuration || 0)} seconds
            </p>
          </div>

          {!results.length ? (
            <div className="empty-state empty-state--tall">
              <strong>No timeline yet</strong>
              <span>Load a video and run a scan to build the frame timeline.</span>
            </div>
          ) : (
            <>
              <div className="timeline-bar">
                {detectionFrames.map((entry) => {
                  const left = videoDuration ? (entry.time / videoDuration) * 100 : 0;
                  const activeFrame = selectedFrame?.time === entry.time;
                  return (
                    <button
                      key={`${entry.time}-${entry.filename}`}
                      type="button"
                      className={`timeline-marker timeline-marker--${resultTone(entry.detections)} ${activeFrame ? 'is-active' : ''}`}
                      style={{ left: `${left}%` }}
                      onClick={() => setSelectedFrame(entry)}
                      aria-label={`Jump to ${entry.time.toFixed(1)} seconds`}
                    />
                  );
                })}
              </div>

              <div className="stack-list">
                {detectionFrames.length ? (
                  detectionFrames.map((entry) => (
                    <button
                      key={`${entry.time}-${entry.filename}-list`}
                      type="button"
                      className={`timeline-list-item ${selectedFrame?.time === entry.time ? 'is-active' : ''}`}
                      onClick={() => setSelectedFrame(entry)}
                    >
                      <div>
                        <strong>{entry.time.toFixed(1)} s</strong>
                        <span>{buildDetectionSummary(entry)}</span>
                      </div>
                      <span>{entry.inference_time_ms} ms</span>
                    </button>
                  ))
                ) : (
                  <div className="notice notice-success">No detections were returned for the selected footage.</div>
                )}
              </div>
            </>
          )}
        </article>

        <article className="surface result-panel">
          <div className="section-header">
            <div>
              <h2 className="section-title">
                {selectedFrame ? `Frame at ${selectedFrame.time.toFixed(1)} seconds` : 'Choose a frame from the timeline'}
              </h2>
            </div>
          </div>

          {selectedFrame?.mode === 'both' ? (
            <>
              <div className="result-meta">
                <div>
                  <span>Total</span>
                  <strong>{selectedFrame.detections?.length || 0}</strong>
                </div>
                <div>
                  <span>Threat</span>
                  <strong>{selectedFrame.results[0]?.detections?.length || 0}</strong>
                </div>
                <div>
                  <span>Hazard</span>
                  <strong>{selectedFrame.results[1]?.detections?.length || 0}</strong>
                </div>
              </div>

              <div className="dual-result-grid">
                {selectedFrame.results.map((result) => (
                  <section key={`${selectedFrame.time}-${result.model}`} className="dual-result-card">
                    <div className="section-header">
                      <div>
                        <h3 className="dual-result-card__title">{MODEL_META[result.model].label}</h3>
                      </div>
                      <p className="muted-copy">{result.inference_time_ms} ms</p>
                    </div>

                    <div className="result-stage">
                      {result.annotated_image_base64 ? (
                        <img
                          src={`data:image/jpeg;base64,${result.annotated_image_base64}`}
                          alt={`${result.model} frame at ${selectedFrame.time.toFixed(1)} seconds`}
                        />
                      ) : (
                        <div className="empty-state empty-state--media">
                          <strong>No annotated preview available</strong>
                        </div>
                      )}
                    </div>

                    {result.detections?.length ? (
                      <div className="stack-list">
                        {result.detections.map((detection, index) => (
                          <div
                            key={`${result.model}-${detection.class}-${index}`}
                            className={`notice notice-inline notice-${resultTone([{ ...detection, model: result.model }])}`}
                          >
                            <span>{detection.class}</span>
                            <strong>{Math.round((detection.confidence || 0) * 100)}%</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="notice notice-success">No detections for this model on the selected frame.</div>
                    )}
                  </section>
                ))}
              </div>
            </>
          ) : selectedFrame ? (
            <>
              <div className="result-stage">
                {selectedFrame.annotated_image_base64 ? (
                  <img
                    src={`data:image/jpeg;base64,${selectedFrame.annotated_image_base64}`}
                    alt={`Annotated frame at ${selectedFrame.time.toFixed(1)} seconds`}
                  />
                ) : (
                  <div className="empty-state empty-state--media">
                    <strong>No annotated preview available</strong>
                  </div>
                )}
              </div>

              <div className="stack-list">
                {(selectedFrame.detections || []).map((detection, index) => (
                  <div key={`${detection.class}-${index}`} className={`notice notice-inline notice-${resultTone([detection])}`}>
                    <span>{detection.class}</span>
                    <strong>{Math.round((detection.confidence || 0) * 100)}%</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state empty-state--tall">
              <strong>No frame selected</strong>
              <span>Choose a marker from the timeline to inspect the extracted image and detections.</span>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

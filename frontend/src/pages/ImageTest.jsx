import { useEffect, useRef, useState } from 'react';
import DetectionBox from '../components/DetectionBox';
import { useDetection } from '../hooks/useDetection';
import { readDefaultConfidence, readDefaultModel } from '../utils/runtime';

function UploadIllustration() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="12" width="44" height="40" rx="10" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M21 39 30.5 29.5a3 3 0 0 1 4.24 0L43 37.75" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M31.5 25v-10m0 0-5 5m5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ImageTest() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [model, setModel] = useState(readDefaultModel());
  const [confidence, setConfidence] = useState(readDefaultConfidence());
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const previewUrlRef = useRef('');
  const { error, loading, reset, result, runAnnotated } = useDetection();
  const isDualMode = model === 'both';
  const dualResults = result?.mode === 'both' ? result.results : [];

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  function handleFile(nextFile) {
    if (!nextFile || !nextFile.type.startsWith('image/')) {
      return;
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const objectUrl = URL.createObjectURL(nextFile);
    previewUrlRef.current = objectUrl;
    setFile(nextFile);
    setPreviewUrl(objectUrl);
    reset();
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  async function handleRun() {
    if (!file) {
      return;
    }

    await runAnnotated(file, model, confidence);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Scan one image and see exactly what the models catch.</h1>
        </div>
      </header>

      <section className="workspace-grid workspace-grid--wide">
        <div className="workspace-column">
          <article className="surface section-card">
            <div className="section-card__header">
              <div>
                <h2>Image</h2>
              </div>
            </div>

            <button
              type="button"
              className={`upload-stage ${dragging ? 'is-active' : ''} ${previewUrl ? 'has-preview' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => handleFile(event.target.files?.[0])}
              />

              {previewUrl ? (
                <>
                  <img src={previewUrl} alt="Selected preview" className="upload-stage__preview" />
                  <span className="upload-stage__caption">Click or drop another image to replace it.</span>
                </>
              ) : (
                <div className="upload-stage__empty">
                  <UploadIllustration />
                  <strong>Drop an image here</strong>
                  <span>PNG and JPEG files work best for quick scanning.</span>
                </div>
              )}
            </button>
          </article>

          <article className="surface section-card">
            <div className="section-card__header">
              <div>
                <h2>Scan</h2>
              </div>
            </div>

            <div className="toggle-row toggle-row--triple">
              {['weapon', 'smokefire', 'both'].map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`toggle-button ${model === option ? 'is-active' : ''}`}
                  onClick={() => setModel(option)}
                >
                  {option === 'weapon'
                    ? 'Threat'
                    : option === 'smokefire'
                      ? 'Hazard'
                      : 'Both'}
                </button>
              ))}
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
              />
            </label>

            <button type="button" className="btn btn-primary" disabled={!file || loading} onClick={handleRun}>
              {loading ? 'Scanning...' : isDualMode ? 'Run both models' : 'Run scan'}
            </button>
          </article>
        </div>

        <article className="surface result-panel">
          <div className="section-header">
            <div>
              <h2 className="section-title">{result?.mode === 'both' ? 'Both models' : 'Result'}</h2>
            </div>
            {result?.inference_time_ms ? <p className="muted-copy">{result.inference_time_ms} ms</p> : null}
          </div>

          {error ? <div className="notice notice-error">{error}</div> : null}

          {!result && !loading ? (
            <div className="empty-state empty-state--tall">
              <strong>Waiting for an image</strong>
              <span>Once you run a scan, the annotated frame and detections will appear here.</span>
            </div>
          ) : null}

          {loading ? <div className="skeleton-panel" /> : null}

          {result?.mode === 'both' ? (
            <>
              <div className="result-meta">
                <div>
                  <span>Total</span>
                  <strong>{result.detections?.length || 0}</strong>
                </div>
                <div>
                  <span>Threat</span>
                  <strong>{dualResults[0]?.detections?.length || 0}</strong>
                </div>
                <div>
                  <span>Hazard</span>
                  <strong>{dualResults[1]?.detections?.length || 0}</strong>
                </div>
              </div>

              <div className="dual-result-grid">
                {dualResults.map((entry) => (
                  <section key={entry.model} className="dual-result-card">
                    <div className="section-header">
                      <div>
                        <h3 className="dual-result-card__title">
                          {entry.model === 'weapon' ? 'Threat model' : 'Hazard model'}
                        </h3>
                      </div>
                      <p className="muted-copy">{entry.inference_time_ms} ms</p>
                    </div>

                    <div className="result-stage">
                      <img
                        src={
                          entry.annotated_image_base64
                            ? `data:image/jpeg;base64,${entry.annotated_image_base64}`
                            : previewUrl
                        }
                        alt={`${entry.model} scan result`}
                      />
                    </div>

                    {entry.detections?.length ? (
                      <div className="stack-list">
                        {entry.detections.map((detection, index) => (
                          <DetectionBox
                            key={`${entry.model}-${detection.class}-${index}`}
                            detection={detection}
                            model={entry.model}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="notice notice-success">
                        No {entry.model === 'weapon' ? 'threat' : 'hazard'} detections.
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </>
          ) : result ? (
            <>
              <div className="result-stage">
                <img
                  src={
                    result.annotated_image_base64
                      ? `data:image/jpeg;base64,${result.annotated_image_base64}`
                      : previewUrl
                  }
                  alt="Annotated detection result"
                />
              </div>

              <div className="result-meta">
                <div>
                  <span>Detections</span>
                  <strong>{result.detections?.length || 0}</strong>
                </div>
                <div>
                  <span>Model</span>
                  <strong>{result.model === 'weapon' ? 'Threat' : 'Hazard'}</strong>
                </div>
                <div>
                  <span>Image size</span>
                  <strong>{result.image_size?.join(' x ') || 'n/a'}</strong>
                </div>
              </div>

              {result.detections?.length ? (
                <div className="stack-list">
                  {result.detections.map((detection, index) => (
                    <DetectionBox key={`${detection.class}-${index}`} detection={detection} model={model} />
                  ))}
                </div>
              ) : (
                <div className="notice notice-success">No detections were returned for this frame.</div>
              )}
            </>
          ) : null}
        </article>
      </section>
    </div>
  );
}

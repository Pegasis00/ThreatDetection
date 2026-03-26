import { useMemo, useState } from 'react';
import { useRuntimeSignal } from '../hooks/useRuntimeSignal';
import { getResolvedApiUrl } from '../utils/api';
import { hasSelectedModels, MODEL_META, SINGLE_MODELS, toggleModelSelection } from '../utils/models';
import {
  clearConfiguredApiUrl,
  clearDetectionHistory,
  getDetectionHistory,
  parseConfiguredApiUrl,
  readConfiguredApiUrl,
  readDefaultConfidence,
  readDefaultModelSelection,
  writeConfiguredApiUrl,
  writeDefaultConfidence,
  writeDefaultModelSelection,
} from '../utils/runtime';

export default function Settings() {
  useRuntimeSignal();
  const [apiUrl, setApiUrl] = useState(readConfiguredApiUrl());
  const [defaultSelection, setDefaultSelection] = useState(readDefaultModelSelection());
  const [defaultConfidence, setDefaultConfidence] = useState(readDefaultConfidence());
  const [connectionFeedback, setConnectionFeedback] = useState(null);
  const historyCount = getDetectionHistory().length;

  const secureContext = useMemo(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    return window.isSecureContext || window.location.hostname === 'localhost';
  }, []);

  function handleSaveApiUrl() {
    const parsed = parseConfiguredApiUrl(apiUrl);
    if (!parsed.valid) {
      setConnectionFeedback({ tone: 'error', text: parsed.error });
      return;
    }

    if (parsed.value) {
      writeConfiguredApiUrl(parsed.value);
      setApiUrl(parsed.value);
      setConnectionFeedback({
        tone: 'success',
        text: 'Server override saved. New requests will use this URL immediately.',
      });
      return;
    }

    clearConfiguredApiUrl();
    setApiUrl('');
    setConnectionFeedback({
      tone: 'success',
      text: 'Server override cleared. The app is back to automatic URL detection.',
    });
  }

  function handleModelToggle(nextModel) {
    setDefaultSelection((current) => {
      const nextSelection = toggleModelSelection(current, nextModel);
      writeDefaultModelSelection(nextSelection);
      return nextSelection;
    });
  }

  function handleConfidenceChange(nextValue) {
    setDefaultConfidence(nextValue);
    writeDefaultConfidence(nextValue);
  }

  function handleClearHistory() {
    clearDetectionHistory();
  }

  function handleResetApiUrl() {
    clearConfiguredApiUrl();
    setApiUrl('');
    setConnectionFeedback({
      tone: 'success',
      text: 'Manual server URL removed. Automatic host detection is active again.',
    });
  }

  return (
    <div className="page page--narrow">
      <header className="page-header">
        <div>
          <h1 className="page-title">Point the app at the right server and set your defaults.</h1>
          <p className="page-copy">
            The saved URL and defaults here drive the scan pages and the live feed.
          </p>
        </div>
      </header>

      <section className="surface section-card">
        <div className="section-card__header">
          <div>
            <p className="section-card__kicker">Connection</p>
            <h2>Server URL</h2>
          </div>
        </div>

        <label className="field-group">
          <div className="field-group__label-row">
            <span>Server URL</span>
            <strong>Current: {getResolvedApiUrl()}</strong>
          </div>
          <input
            type="text"
            className="text-input"
            value={apiUrl}
            onChange={(event) => setApiUrl(event.target.value)}
            placeholder="http://192.168.1.25:8000"
          />
        </label>

        <div className="header-actions">
          <button type="button" className="btn btn-primary" onClick={handleSaveApiUrl}>
            Save server URL
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleResetApiUrl}>
            Use auto-detected URL
          </button>
        </div>

        {connectionFeedback ? (
          <div className={`notice ${connectionFeedback.tone === 'error' ? 'notice-error' : 'notice-success'}`}>
            {connectionFeedback.text}
          </div>
        ) : null}

        {!secureContext ? (
          <div className="notice notice-warning">
            Camera access on phones and most browsers requires HTTPS or localhost. If live feed fails on another
            device, deploy this frontend over HTTPS.
          </div>
        ) : null}
      </section>

      <section className="surface section-card">
        <div className="section-card__header">
          <div>
            <p className="section-card__kicker">Defaults</p>
            <h2>Startup preferences</h2>
          </div>
        </div>

        <div className="toggle-row toggle-row--triple">
          {SINGLE_MODELS.map((option) => (
            <button
              key={option}
              type="button"
              className={`toggle-button ${defaultSelection.includes(option) ? 'is-active' : ''}`}
              onClick={() => handleModelToggle(option)}
            >
              {MODEL_META[option].buttonLabel}
            </button>
          ))}
        </div>

        {!hasSelectedModels(defaultSelection) ? (
          <div className="notice notice-warning">No startup model is selected right now. The scan pages will open with nothing selected.</div>
        ) : null}

        <label className="field-group">
          <div className="field-group__label-row">
            <span>Default confidence</span>
            <strong>{defaultConfidence.toFixed(2)}</strong>
          </div>
          <input
            type="range"
            min="0.05"
            max="0.95"
            step="0.05"
            className="range-input"
            value={defaultConfidence}
            onChange={(event) => handleConfidenceChange(Number.parseFloat(event.target.value))}
          />
        </label>
      </section>

      <section className="surface section-card">
        <div className="section-card__header">
          <div>
            <p className="section-card__kicker">Storage</p>
            <h2>Local detection history</h2>
          </div>
        </div>

        <p className="muted-copy">
          The console stores up to 50 recent detections locally so the dashboard can show a lightweight event history.
        </p>
        <div className="result-meta">
          <div>
            <span>Stored events</span>
            <strong>{historyCount}</strong>
          </div>
          <div>
            <span>Retention cap</span>
            <strong>50 entries</strong>
          </div>
        </div>
        <button type="button" className="btn btn-danger" onClick={handleClearHistory}>
          Clear local history
        </button>
      </section>
    </div>
  );
}

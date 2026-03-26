import { useEffect, useMemo, useState } from 'react';
import ModelBadge from '../components/ModelBadge';
import { useRuntimeSignal } from '../hooks/useRuntimeSignal';
import { fetchHealth, getResolvedApiUrl } from '../utils/api';
import { MODEL_META, SINGLE_MODELS } from '../utils/models';
import { getDetectionHistory } from '../utils/runtime';

function MetricCard({ label, value, hint, tone = 'neutral' }) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <p className="metric-card__label">{label}</p>
      <strong className="metric-card__value">{value}</strong>
      <span className="metric-card__hint">{hint}</span>
    </article>
  );
}

function StatusSummary({ title, loaded, error, model }) {
  return (
    <article className="surface section-card">
      <div className="section-card__header">
        <div>
          <p className="section-card__kicker">{loaded ? 'Ready' : 'Needs attention'}</p>
          <h3>{title}</h3>
        </div>
        <ModelBadge model={model} />
      </div>
      <p className="muted-copy">
        {loaded
          ? 'Loaded and available for inference requests.'
          : error || 'The model is not loaded yet, so requests for this engine will fail.'}
      </p>
    </article>
  );
}

export default function Dashboard() {
  const runtimeSignal = useRuntimeSignal();
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState('');
  const history = getDetectionHistory();

  useEffect(() => {
    let active = true;

    fetchHealth()
      .then((result) => {
        if (active) {
          setHealth(result);
          setHealthError('');
        }
      })
      .catch((error) => {
        if (active) {
          setHealth(null);
          setHealthError(error.message || 'The backend is unavailable.');
        }
      });

    return () => {
      active = false;
    };
  }, [runtimeSignal]);

  const metrics = useMemo(() => {
    const counts = Object.fromEntries(
      SINGLE_MODELS.map((model) => [model, history.filter((entry) => entry.model === model).length]),
    );
    const averageInference = history.length
      ? `${Math.round(history.reduce((total, entry) => total + (entry.inferenceMs || 0), 0) / history.length)} ms`
      : 'n/a';

    return {
      averageInference,
      counts,
      recent: history.slice(0, 8),
      total: history.length,
    };
  }, [history]);

  const backendStatus =
    health?.status === 'ok' ? 'is-online' : health?.status === 'degraded' ? 'is-warning' : 'is-offline';

  return (
    <div className="page">
      <section className="overview-hero surface">
        <div className="overview-hero__content">
          <h1 className="page-title">See model status and recent detections at a glance.</h1>
          <p className="page-copy">
            One place for health, saved events, and the current server target.
          </p>
          <div className="hero-status-row">
            <span className={`status-pill ${backendStatus}`}>
              <span className="status-pill__dot" />
              {health?.status || 'offline'}
            </span>
            <span className="status-pill">
              <span className="status-pill__dot" />
              Server: {getResolvedApiUrl()}
            </span>
          </div>
        </div>
        <div className="overview-hero__aside">
          <div className="signal-stack">
            {SINGLE_MODELS.map((model) => (
              <div key={model}>
                <span>{MODEL_META[model].label} model</span>
                <strong>{health?.models?.[model]?.loaded ? 'online' : 'offline'}</strong>
              </div>
            ))}
            <div>
              <span>Logged events</span>
              <strong>{metrics.total}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard
          label="Logged detections"
          value={metrics.total}
          hint="Rolling local history"
        />
        {SINGLE_MODELS.map((model) => (
          <MetricCard
            key={model}
            label={`${MODEL_META[model].label} hits`}
            value={metrics.counts[model]}
            hint={`${MODEL_META[model].label} detections`}
            tone={MODEL_META[model].tone}
          />
        ))}
        <MetricCard
          label="Average inference"
          value={metrics.averageInference}
          hint="Across saved detections"
          tone="accent"
        />
      </section>

      <section className="two-column-grid">
        {SINGLE_MODELS.map((model) => (
          <StatusSummary
            key={model}
            title={`${MODEL_META[model].label} engine`}
            model={model}
            loaded={Boolean(health?.models?.[model]?.loaded)}
            error={health?.models?.[model]?.error}
          />
        ))}
      </section>

      {healthError ? <div className="notice notice-warning">{healthError}</div> : null}

      <section className="surface">
        <div className="section-header">
          <div>
            <p className="eyebrow">Event log</p>
            <h2 className="section-title">Recent detections</h2>
          </div>
          <p className="muted-copy">Newest entries are shown first, with model, confidence, and inference time.</p>
        </div>

        {metrics.recent.length === 0 ? (
          <div className="empty-state">
            <strong>No detections yet</strong>
            <span>Run an image, live feed, or video scan to populate the timeline.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Model</th>
                  <th>Class</th>
                  <th>Confidence</th>
                  <th>Inference</th>
                </tr>
              </thead>
              <tbody>
                {metrics.recent.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.timestamp).toLocaleString()}</td>
                    <td>
                      <ModelBadge model={entry.model} />
                    </td>
                    <td className="table-emphasis">{entry.class || 'unknown'}</td>
                    <td>{Math.round((entry.confidence || 0) * 100)}%</td>
                    <td>{entry.inferenceMs ?? 'n/a'} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

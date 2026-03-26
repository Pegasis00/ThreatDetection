import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useRuntimeSignal } from '../hooks/useRuntimeSignal';
import { fetchHealth } from '../utils/api';
import { MODEL_META, SINGLE_MODELS } from '../utils/models';

const NAV_ITEMS = [
  {
    to: '/',
    label: 'Overview',
    icon: (
      <path
        d="M4 11.5 12 4l8 7.5v7a1.5 1.5 0 0 1-1.5 1.5h-4.25v-5.25a1 1 0 0 0-1-1H10.75a1 1 0 0 0-1 1V20H5.5A1.5 1.5 0 0 1 4 18.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    to: '/image-test',
    label: 'Image Scan',
    icon: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="m7 15 3.25-3.25a1.5 1.5 0 0 1 2.12 0L16.5 16M14.75 9.25h.01" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    to: '/live-feed',
    label: 'Live Feed',
    icon: (
      <>
        <rect x="3" y="6" width="13" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="m16 10 4.5-2.25A1 1 0 0 1 22 8.64v6.72a1 1 0 0 1-1.5.89L16 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    to: '/video-test',
    label: 'Video Scan',
    icon: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M9 5v14M15 5v14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <>
        <path
          d="m12 3 1.3 1.8 2.2.44 1.76 1.46-.23 2.24 1.1 1.96-1.1 1.96.23 2.24-1.76 1.46-2.2.44L12 21l-1.3-1.8-2.2-.44-1.76-1.46.23-2.24-1.1-1.96 1.1-1.96-.23-2.24L8.5 5.24l2.2-.44Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      </>
    ),
  },
];

function NavIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

function ModelStatus({ label, online }) {
  return (
    <div className="sidebar-status-row">
      <span>{label}</span>
      <span className={`status-pill ${online ? 'is-online' : 'is-offline'}`}>
        <span className="status-pill__dot" />
        {online ? 'ready' : 'offline'}
      </span>
    </div>
  );
}

export default function Sidebar({ open, onClose, onNavigate }) {
  const runtimeSignal = useRuntimeSignal();
  const emptyModels = Object.fromEntries(SINGLE_MODELS.map((model) => [model, null]));
  const [health, setHealth] = useState({
    service: 'checking',
    models: emptyModels,
  });

  useEffect(() => {
    let active = true;

    async function pollHealth() {
      try {
        const result = await fetchHealth();
        if (!active) {
          return;
        }

        setHealth({
          service: result.status === 'ok' ? 'online' : 'degraded',
          models: Object.fromEntries(
            SINGLE_MODELS.map((model) => [model, Boolean(result?.models?.[model]?.loaded)]),
          ),
        });
      } catch {
        if (active) {
          setHealth({
            service: 'offline',
            models: Object.fromEntries(SINGLE_MODELS.map((model) => [model, false])),
          });
        }
      }
    }

    pollHealth();
    const intervalId = window.setInterval(pollHealth, 15000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [runtimeSignal]);

  return (
    <aside className={`app-sidebar ${open ? 'is-open' : ''}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand__mark">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 3.2c2.52 2.26 5.28 3.4 8.3 3.4v4.54c0 4.57-3 8.63-8.3 10.66-5.3-2.03-8.3-6.1-8.3-10.66V6.6c3.02 0 5.79-1.13 8.3-3.4Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="m8.8 12 2.15 2.15L15.4 9.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="sidebar-brand__copy">
          <strong>Pegasusxz</strong>
        </div>
        <button type="button" className="icon-button mobile-only" onClick={onClose} aria-label="Close navigation">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="sidebar-block">
        <nav className="sidebar-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) => `sidebar-link ${isActive ? 'is-active' : ''}`}
            >
              <NavIcon>{item.icon}</NavIcon>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="sidebar-block sidebar-block--status">
        <div className="sidebar-panel">
          <div className="sidebar-panel__header">
            <p className="sidebar-kicker">Status</p>
            <span
              className={`status-pill ${
                health.service === 'online'
                  ? 'is-online'
                  : health.service === 'degraded'
                    ? 'is-warning'
                    : health.service === 'offline'
                      ? 'is-offline'
                      : ''
              }`}
            >
              <span className="status-pill__dot" />
              {health.service}
            </span>
          </div>
          <div className="sidebar-status-list">
            {SINGLE_MODELS.map((model) => (
              <ModelStatus key={model} label={MODEL_META[model].label} online={Boolean(health.models[model])} />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import ImageTest from './pages/ImageTest';
import LiveFeed from './pages/LiveFeed';
import Settings from './pages/Settings';
import VideoTest from './pages/VideoTest';

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onNavigate={() => setSidebarOpen(false)} />

        <div className="app-main">
          <header className="app-topbar">
            <button
              type="button"
              className="icon-button mobile-only"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-label="Toggle navigation"
            >
              <MenuIcon />
            </button>
            <div className="topbar-brand">
              <span className="topbar-brand__title">Pegasusxz</span>
              <span className="topbar-brand__subtitle">Surveillance Console</span>
            </div>
          </header>

          <main className="app-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/image-test" element={<ImageTest />} />
              <Route path="/live-feed" element={<LiveFeed />} />
              <Route path="/video-test" element={<VideoTest />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>

        <button
          type="button"
          className={`app-backdrop ${sidebarOpen ? 'is-visible' : ''}`}
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        />
      </div>
    </BrowserRouter>
  );
}

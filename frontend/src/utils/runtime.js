import { normalizeModelSelection, serializeModelSelection } from './models';

const API_URL_KEY = 'Pegasusxz_api_url';
const DEFAULT_MODEL_KEY = 'Pegasusxz_default_model';
const DEFAULT_CONFIDENCE_KEY = 'Pegasusxz_default_conf';
const LIVE_CONFIDENCE_KEY = 'Pegasusxz_live_confidence';
const HISTORY_KEY = 'Pegasusxz_detection_history';
const RUNTIME_EVENT = 'Pegasusxz:runtime-change';
const MAX_HISTORY = 50;
const DEFAULT_API_PORT = import.meta.env.VITE_API_PORT || '8000';
const MIN_CONFIDENCE = 0.05;
const MAX_CONFIDENCE = 0.95;
let runtimeVersion = 0;

function hasWindow() {
  return typeof window !== 'undefined';
}

function getStorage() {
  return hasWindow() ? window.localStorage : null;
}

function readRawValue(key) {
  return getStorage()?.getItem(key) ?? '';
}

function bumpRuntimeVersion(detail = {}) {
  runtimeVersion += 1;

  if (hasWindow()) {
    window.dispatchEvent(
      new CustomEvent(RUNTIME_EVENT, {
        detail: { ...detail, version: runtimeVersion },
      }),
    );
  }
}

export function readStringPreference(key, fallback) {
  const value = readRawValue(key).trim();
  return value || fallback;
}

function clampConfidence(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(MAX_CONFIDENCE, Math.max(MIN_CONFIDENCE, value));
}

export function readNumberPreference(key, fallback) {
  const value = Number.parseFloat(readRawValue(key));
  return clampConfidence(value, fallback);
}

export function writePreference(key, value) {
  const nextValue = String(value);
  if (readRawValue(key) === nextValue) {
    return;
  }

  getStorage()?.setItem(key, nextValue);
  bumpRuntimeVersion({ key });
}

export function normalizeApiUrl(url) {
  return url.trim().replace(/\/+$/, '');
}

export function parseConfiguredApiUrl(url) {
  const normalized = normalizeApiUrl(url);
  if (!normalized) {
    return { valid: true, value: '' };
  }

  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Unsupported protocol');
    }

    return {
      valid: true,
      value: parsed.toString().replace(/\/+$/, ''),
    };
  } catch {
    return {
      valid: false,
      error: 'Enter a full server URL beginning with http:// or https://.',
    };
  }
}

function inferDefaultApiUrl() {
  if (!hasWindow()) {
    return `http://localhost:${DEFAULT_API_PORT}`;
  }

  const { protocol, hostname } = window.location;
  const resolvedProtocol = protocol === 'https:' ? 'https:' : 'http:';
  const resolvedHost = hostname || 'localhost';
  return `${resolvedProtocol}//${resolvedHost}:${DEFAULT_API_PORT}`;
}

export function resolveApiBaseUrl() {
  const configuredUrl = normalizeApiUrl(readRawValue(API_URL_KEY));
  if (configuredUrl) {
    return configuredUrl;
  }

  const envUrl = normalizeApiUrl(import.meta.env.VITE_API_URL || '');
  if (envUrl) {
    return envUrl;
  }

  return inferDefaultApiUrl();
}

export function resolveWsBaseUrl(apiBaseUrl = resolveApiBaseUrl()) {
  if (apiBaseUrl.startsWith('https://')) {
    return apiBaseUrl.replace(/^https:\/\//, 'wss://');
  }

  if (apiBaseUrl.startsWith('http://')) {
    return apiBaseUrl.replace(/^http:\/\//, 'ws://');
  }

  return apiBaseUrl;
}

export function readDefaultModelSelection() {
  return normalizeModelSelection(readStringPreference(DEFAULT_MODEL_KEY, 'weapon'));
}

export function writeDefaultModelSelection(selection) {
  writePreference(DEFAULT_MODEL_KEY, serializeModelSelection(normalizeModelSelection(selection)));
}

export function readDefaultConfidence() {
  return readNumberPreference(DEFAULT_CONFIDENCE_KEY, 0.25);
}

export function writeDefaultConfidence(value) {
  writePreference(DEFAULT_CONFIDENCE_KEY, clampConfidence(value, 0.25));
}

export function readLiveConfidence() {
  return readNumberPreference(LIVE_CONFIDENCE_KEY, readDefaultConfidence());
}

export function writeLiveConfidence(value) {
  writePreference(LIVE_CONFIDENCE_KEY, clampConfidence(value, readDefaultConfidence()));
}

function readHistory() {
  try {
    return JSON.parse(readRawValue(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function getDetectionHistory() {
  return readHistory();
}

export function addDetectionHistoryEntries(entries) {
  if (!entries.length) {
    return;
  }

  const history = readHistory();
  history.unshift(...entries);
  history.length = Math.min(history.length, MAX_HISTORY);
  writePreference(HISTORY_KEY, JSON.stringify(history));
}

export function clearDetectionHistory() {
  if (!readRawValue(HISTORY_KEY)) {
    return;
  }

  getStorage()?.removeItem(HISTORY_KEY);
  bumpRuntimeVersion({ key: HISTORY_KEY });
}

export function readConfiguredApiUrl() {
  return normalizeApiUrl(readRawValue(API_URL_KEY));
}

export function writeConfiguredApiUrl(url) {
  writePreference(API_URL_KEY, normalizeApiUrl(url));
}

export function clearConfiguredApiUrl() {
  if (!readRawValue(API_URL_KEY)) {
    return;
  }

  getStorage()?.removeItem(API_URL_KEY);
  bumpRuntimeVersion({ key: API_URL_KEY });
}

export function createClientId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getRuntimeSnapshot() {
  return runtimeVersion;
}

export function subscribeRuntimeChanges(listener) {
  if (!hasWindow()) {
    return () => {};
  }

  const handleRuntimeChange = () => {
    listener();
  };
  const handleStorage = () => {
    runtimeVersion += 1;
    listener();
  };

  window.addEventListener(RUNTIME_EVENT, handleRuntimeChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(RUNTIME_EVENT, handleRuntimeChange);
    window.removeEventListener('storage', handleStorage);
  };
}

export const storageKeys = {
  apiUrl: API_URL_KEY,
  history: HISTORY_KEY,
};

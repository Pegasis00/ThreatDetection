import { resolveApiBaseUrl, resolveWsBaseUrl } from './runtime';

const DEFAULT_REQUEST_TIMEOUT_MS = Number.parseInt(import.meta.env.VITE_API_TIMEOUT_MS || '15000', 10);
const HEALTH_REQUEST_TIMEOUT_MS = Math.min(DEFAULT_REQUEST_TIMEOUT_MS, 5000);

function buildFormData(fields) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      formData.append(key, value);
    }
  }

  return formData;
}

function getErrorDetail(payload, fallback) {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  if (typeof payload.detail === 'string' && payload.detail.trim()) {
    return payload.detail;
  }

  if (Array.isArray(payload.detail) && payload.detail.length) {
    return payload.detail
      .map((item) => item?.msg || item?.detail || JSON.stringify(item))
      .join(', ');
  }

  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error;
  }

  return fallback;
}

async function handleResponse(response) {
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;

    try {
      const payload = await response.json();
      detail = getErrorDetail(payload, detail);
    } catch {
      // Ignore malformed or empty error bodies.
    }

    throw new Error(detail);
  }

  return response.json();
}

function getBaseUrl() {
  return resolveApiBaseUrl();
}

async function requestJson(path, options = {}) {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...requestInit } = options;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getBaseUrl()}${path}`, {
      ...requestInit,
      signal: controller.signal,
    });

    return await handleResponse(response);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`The backend did not respond within ${Math.round(timeoutMs / 1000)} seconds.`);
    }

    if (error instanceof TypeError) {
      throw new Error('Unable to reach the backend. Check the API URL, CORS origins, and deployment status.');
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchHealth() {
  return requestJson('/health', { timeoutMs: HEALTH_REQUEST_TIMEOUT_MS });
}

export async function detectAnnotated(imageFile, modelName, confidenceThreshold = 0.25) {
  return requestJson('/detect/annotated', {
    method: 'POST',
    body: buildFormData({
      image: imageFile,
      model_name: modelName,
      confidence_threshold: confidenceThreshold,
    }),
  });
}

export async function detectBatch(
  imageFiles,
  modelName,
  confidenceThreshold = 0.25,
  includeAnnotations = false,
) {
  const formData = new FormData();
  imageFiles.forEach((file) => formData.append('images', file));
  formData.append('model_name', modelName);
  formData.append('confidence_threshold', confidenceThreshold);
  formData.append('include_annotations', String(includeAnnotations));

  return requestJson('/detect/batch', {
    method: 'POST',
    body: formData,
  });
}

export function createStreamSocket(modelName, confidenceThreshold = 0.25) {
  const params = new URLSearchParams({
    confidence: String(confidenceThreshold),
  });

  return new WebSocket(
    `${resolveWsBaseUrl(getBaseUrl())}/ws/stream/${encodeURIComponent(modelName)}?${params.toString()}`,
  );
}

export function getResolvedApiUrl() {
  return getBaseUrl();
}

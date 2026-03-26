import { useCallback, useState } from 'react';
import { detectAnnotated } from '../utils/api';
import { addDetectionHistoryEntries, createClientId, getDetectionHistory } from '../utils/runtime';

function buildHistoryEntries(result) {
  const timestamp = new Date().toISOString();

  return (result.detections || []).map((detection) => ({
    id: createClientId(),
    timestamp,
    model: result.model,
    class: detection.class,
    confidence: detection.confidence,
    bbox: detection.bbox,
    inferenceMs: result.inference_time_ms,
  }));
}

function buildCombinedResult(results) {
  const entries = results.map((result) => ({
    ...result,
    mode: 'single',
  }));

  return {
    mode: 'both',
    image_size: entries[0]?.image_size || entries[1]?.image_size || null,
    inference_time_ms: Number(
      entries.reduce((total, entry) => total + (entry.inference_time_ms || 0), 0).toFixed(2),
    ),
    detections: entries.flatMap((entry) =>
      (entry.detections || []).map((detection) => ({
        ...detection,
        model: entry.model,
      })),
    ),
    results: entries,
  };
}

export { getDetectionHistory };

export function useDetection() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const runAnnotated = useCallback(async (file, modelName, confidenceThreshold) => {
    setLoading(true);
    setError(null);

    try {
      const nextResult =
        modelName === 'both'
          ? buildCombinedResult(
              await Promise.all([
                detectAnnotated(file, 'weapon', confidenceThreshold),
                detectAnnotated(file, 'smokefire', confidenceThreshold),
              ]),
            )
          : {
              ...(await detectAnnotated(file, modelName, confidenceThreshold)),
              mode: 'single',
            };

      setResult(nextResult);
      addDetectionHistoryEntries(
        nextResult.mode === 'both'
          ? nextResult.results.flatMap((entry) => buildHistoryEntries(entry))
          : buildHistoryEntries(nextResult),
      );
      return nextResult;
    } catch (requestError) {
      setResult(null);
      setError(requestError.message || 'Detection failed.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    error,
    loading,
    reset,
    result,
    runAnnotated,
  };
}

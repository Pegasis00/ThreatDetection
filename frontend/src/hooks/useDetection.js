import { useCallback, useState } from 'react';
import { detectAnnotated } from '../utils/api';
import { buildCombinedResult, hasSelectedModels, isMultiModelSelection } from '../utils/models';
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

export { getDetectionHistory };

export function useDetection() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const runAnnotated = useCallback(async (file, selectedModels, confidenceThreshold) => {
    setLoading(true);
    setError(null);

    try {
      if (!hasSelectedModels(selectedModels)) {
        throw new Error('Select at least one model to run a scan.');
      }

      const nextResult = isMultiModelSelection(selectedModels)
        ? buildCombinedResult(
            await Promise.all(
              selectedModels.map((activeModel) =>
                detectAnnotated(file, activeModel, confidenceThreshold),
              ),
            ),
            selectedModels,
          )
        : {
            ...(await detectAnnotated(file, selectedModels[0], confidenceThreshold)),
            mode: 'single',
          };

      setResult(nextResult);
      addDetectionHistoryEntries(
        nextResult.mode === 'multi'
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

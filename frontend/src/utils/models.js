export const SINGLE_MODELS = ['weapon', 'smokefire', 'violence'];

export const MODEL_META = {
  weapon: {
    badgeLabel: 'Threat model',
    beep: 1180,
    buttonLabel: 'Threat',
    canvasTone: '#ff6b57',
    label: 'Threat',
    shortLabel: 'T',
    tone: 'danger',
  },
  smokefire: {
    badgeLabel: 'Hazard model',
    beep: 760,
    buttonLabel: 'Hazard',
    canvasTone: '#ffb454',
    label: 'Hazard',
    shortLabel: 'H',
    tone: 'warning',
  },
  violence: {
    badgeLabel: 'Violence model',
    beep: 980,
    buttonLabel: 'Violence',
    canvasTone: '#d65293',
    label: 'Violence',
    shortLabel: 'V',
    tone: 'danger',
  },
};

export function normalizeModelSelection(value, fallback = ['weapon']) {
  const fallbackSelection = [...fallback];

  if (Array.isArray(value)) {
    const normalizedArray = SINGLE_MODELS.filter((model, index, source) => value.includes(model) && source.indexOf(model) === index);
    return normalizedArray.length ? normalizedArray : fallbackSelection;
  }

  if (typeof value !== 'string') {
    return fallbackSelection;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallbackSelection;
  }

  if (normalized === 'both') {
    return ['weapon', 'smokefire'];
  }
  if (normalized === 'all') {
    return [...SINGLE_MODELS];
  }
  if (SINGLE_MODELS.includes(normalized)) {
    return [normalized];
  }

  const selection = SINGLE_MODELS.filter((model) => normalized.split(',').map((item) => item.trim()).includes(model));
  return selection.length ? selection : fallbackSelection;
}

export function serializeModelSelection(selection) {
  return SINGLE_MODELS.filter((model) => selection.includes(model)).join(',');
}

export function toggleModelSelection(selection, model) {
  if (!SINGLE_MODELS.includes(model)) {
    return [...selection];
  }

  return selection.includes(model)
    ? selection.filter((item) => item !== model)
    : [...selection, model];
}

export function hasSelectedModels(selection) {
  return Array.isArray(selection) && selection.length > 0;
}

export function isMultiModelSelection(selection) {
  return Array.isArray(selection) && selection.length > 1;
}

export function getSelectionDisplayLabel(selection) {
  if (!hasSelectedModels(selection)) {
    return 'No models';
  }

  if (selection.length === 1) {
    return MODEL_META[selection[0]]?.label || selection[0];
  }

  return selection.map((model) => MODEL_META[model]?.label || model).join(' + ');
}

export function getModelTone(model) {
  return MODEL_META[model]?.tone || 'warning';
}

export function buildCombinedResult(results, selectedModels) {
  const entries = results.map((result) => ({
    ...result,
    mode: 'single',
  }));

  return {
    mode: 'multi',
    selected_models: [...selectedModels],
    image_size: entries.find((entry) => entry?.image_size)?.image_size || null,
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

import { MODEL_META } from '../utils/models';

export default function ModelBadge({ model }) {
  const badgeClass =
    model === 'weapon' ? 'badge-weapon' : model === 'violence' ? 'badge-violence' : 'badge-smokefire';
  const label = MODEL_META[model]?.badgeLabel || `${model} model`;

  return (
    <span className={`badge ${badgeClass}`}>
      <span className="badge__dot" />
      {label}
    </span>
  );
}

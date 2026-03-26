import ModelBadge from './ModelBadge';

export default function DetectionBox({ detection, model }) {
  const toneClass =
    model === 'weapon' ? 'is-weapon' : model === 'violence' ? 'is-violence' : 'is-hazard';
  const confidence = Math.round((detection.confidence || 0) * 100);
  const [x1, y1, x2, y2] = detection.bbox || [0, 0, 0, 0];

  return (
    <article className={`detection-card ${toneClass}`}>
      <div className="detection-card__header">
        <div>
          <p className="detection-card__title">{detection.class || 'unknown'}</p>
          <ModelBadge model={model} />
        </div>
        <div className="detection-card__confidence">
          <span>{confidence}%</span>
          <small>confidence</small>
        </div>
      </div>

      <div className="detection-card__meter">
        <div className="detection-card__meter-fill" style={{ width: `${confidence}%` }} />
      </div>

      <div className="detection-card__coords">
        {[
          ['x1', x1],
          ['y1', y1],
          ['x2', x2],
          ['y2', y2],
        ].map(([label, value]) => (
          <div key={label} className="detection-card__coord">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

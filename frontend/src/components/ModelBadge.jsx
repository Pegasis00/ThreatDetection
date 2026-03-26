export default function ModelBadge({ model }) {
  const isWeapon = model === 'weapon';

  return (
    <span className={`badge ${isWeapon ? 'badge-weapon' : 'badge-smokefire'}`}>
      <span className="badge__dot" />
      {isWeapon ? 'Threat model' : 'Hazard model'}
    </span>
  );
}

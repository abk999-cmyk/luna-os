import { PrimitiveProps } from './types';

export function Avatar({ id, props }: PrimitiveProps) {
  const name = props.name || props.label || '?';
  const size = Number(props.size) || 36;
  const src = props.src || props.image;
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  // Generate color from name
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;

  if (src) {
    return (
      <img id={id} src={src} alt={name} style={{
        width: size, height: size, borderRadius: '50%', objectFit: 'cover',
        border: '2px solid rgba(255,255,255,0.1)',
      }} />
    );
  }

  return (
    <div id={id} style={{
      width: size, height: size, borderRadius: '50%',
      background: `hsl(${hue}, 50%, 40%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 600, color: 'white',
      border: '2px solid rgba(255,255,255,0.1)',
      flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

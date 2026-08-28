import { useColorScheme } from '../lib/useColorScheme.js';
import { resolve } from '../lib/palette.js';

export function EventTile({ icon, label, sub, color, running, onClick }) {
  const isDark = useColorScheme();
  const bg = running ? resolve(color, isDark) : undefined;
  return (
    <button
      type="button"
      className={`event-tile${running ? ' running' : ''}`}
      style={bg ? { background: bg } : undefined}
      onClick={onClick}
    >
      <span className="tile-icon">{icon}</span>
      <span className="tile-label">{label}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </button>
  );
}

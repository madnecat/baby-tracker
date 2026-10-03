import { NavLink } from 'react-router-dom';
import { t } from '../i18n/index.js';

const NAV_ITEMS = [
  { to: '/', labelKey: 'nav.log', icon: '✏️', end: true },
  { to: '/history', labelKey: 'nav.history', icon: '📜' },
  { to: '/charts', labelKey: 'nav.charts', icon: '📈' },
  { to: '/mum', labelKey: 'nav.mum', icon: '🤰' },
  { to: '/calendar', labelKey: 'nav.calendar', icon: '📅' },
  { to: '/settings', labelKey: 'nav.settings', icon: '⚙️' },
];

export function Layout({ children }) {
  return (
    <div className="app-shell">
      <main className="app-main">{children}</main>
      <nav className="bottom-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="nav-label">{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

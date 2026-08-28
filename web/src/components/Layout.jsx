import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Log', icon: '✏️', end: true },
  { to: '/history', label: 'History', icon: '📜' },
  { to: '/charts', label: 'Charts', icon: '📈' },
  { to: '/mum', label: 'Mum', icon: '🤰' },
  { to: '/calendar', label: 'Calendar', icon: '📅' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
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
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

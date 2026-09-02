import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { useReliability } from '../features/reliability/ReliabilityProvider';
import { navigation, navigationTitle, type NavigationItem } from './navigation';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { Icon } from '../shared/icons';
import { prefetchTeacherRoute } from './route-loaders';

const THEME_KEY = 'tedvio.teacher-v2.theme';

type Theme = 'light' | 'dark';

function initials(email?: string): string {
  return String(email || 'T').trim().slice(0, 2).toUpperCase();
}

function NavItem({ item, mobile = false }: { item: NavigationItem; mobile?: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}${mobile ? ' mobile' : ''}`}
      onPointerEnter={() => prefetchTeacherRoute(item.to)}
      onFocus={() => prefetchTeacherRoute(item.to)}
      onTouchStart={() => prefetchTeacherRoute(item.to)}
    >
      <Icon name={item.icon} />
      <span>{mobile ? item.shortLabel : item.label}</span>
    </NavLink>
  );
}

export function AppShell() {
  const auth = useAuth();
  const reliability = useReliability();
  const location = useLocation();
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'));
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem(THEME_KEY, theme);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    meta?.setAttribute('content', theme === 'dark' ? '#071426' : '#081a37');
  }, [theme]);

  useEffect(() => {
    setMoreOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById('tedvio-main')?.focus({ preventScroll: true });
    });
  }, [location.pathname]);

  const routeTitle = useMemo(() => navigationTitle(location.pathname), [location.pathname]);
  const primary = navigation.filter((item) => item.section === 'primary');
  const operation = navigation.filter((item) => item.section === 'operation');
  const close = navigation.filter((item) => item.section === 'close');
  const mobileItems = [navigation[0], navigation[2], navigation[3], navigation[4]].filter(Boolean) as NavigationItem[];
  const moreItems = navigation.filter((item) => !mobileItems.some((mobileItem) => mobileItem.to === item.to));
  const connectionLabel = reliability.syncing
    ? 'Sincronizando'
    : reliability.online
      ? reliability.pendingCount
        ? `${reliability.pendingCount} pendiente(s)`
        : 'En línea'
      : 'Sin conexión';
  const connectionTone = reliability.syncing ? 'syncing' : reliability.online ? (reliability.pendingCount ? 'pending' : 'online') : 'offline';

  async function logout() {
    setSigningOut(true);
    try {
      await auth.signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegación principal">
        <Link className="sidebar-brand" to="/" aria-label="TEDVIO Inicio">
          <img src="/assets/tedvio_official_horizontal.svg" alt="TEDVIO" />
        </Link>

        <nav className="sidebar-nav">
          <div className="nav-group">{primary.map((item) => <NavItem item={item} key={item.to} />)}</div>
          <div className="nav-section-label">OPERACIÓN</div>
          <div className="nav-group">{operation.map((item) => <NavItem item={item} key={item.to} />)}</div>
          <div className="nav-section-label">CIERRE ACADÉMICO</div>
          <div className="nav-group">{close.map((item) => <NavItem item={item} key={item.to} />)}</div>
        </nav>

        <div className="sidebar-bottom">
          <NavLink to="/support" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <Icon name="alert" /><span>Soporte</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <Icon name="settings" /><span>Configuración</span>
          </NavLink>
          <div className="rebuild-badge"><Icon name="shield" /><span><b>TEDVIO</b><small>Espacio docente protegido</small></span></div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <span>ESPACIO DOCENTE</span>
            <h1>{routeTitle}</h1>
          </div>
          <div className="topbar-actions">
            <div className={`reliability-pill ${connectionTone}`} role="status" aria-live="polite" title={connectionLabel}>
              <i />
              <span>{connectionLabel}</span>
            </div>
            <button
              className="icon-button support-button"
              type="button"
              onClick={() => reliability.openSupport()}
              aria-label="Reportar un problema"
              title="Reportar un problema"
            >
              <Icon name="alert" />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
              aria-label={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
              title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
            >
              <Icon name={theme === 'light' ? 'moon' : 'sun'} />
            </button>
            <div className="user-chip">
              <span>{initials(auth.user?.email)}</span>
              <div><b>{auth.user?.email?.split('@')[0] || 'Docente'}</b><small>{auth.user?.email || ''}</small></div>
            </div>
            <button className="icon-button" type="button" onClick={logout} disabled={signingOut} aria-label="Cerrar sesión" title="Cerrar sesión">
              <Icon name="logout" />
            </button>
          </div>
        </header>

        <main className="route-container" id="tedvio-main" tabIndex={-1}>
          <RouteErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Navegación móvil">
        {mobileItems.map((item) => <NavItem item={item} mobile key={item.to} />)}
        <button className={moreOpen ? 'nav-item mobile active' : 'nav-item mobile'} type="button" onClick={() => setMoreOpen((value) => !value)}>
          <Icon name="more" /><span>Más</span>
        </button>
      </nav>

      {moreOpen ? (
        <div className="mobile-more-backdrop" onClick={() => setMoreOpen(false)} role="presentation">
          <section className="mobile-more" role="dialog" aria-modal="true" aria-label="Más opciones" onClick={(event) => event.stopPropagation()}>
            <header><div><span>TEDVIO</span><h2>Más herramientas</h2></div><button type="button" className="icon-button" onClick={() => setMoreOpen(false)} aria-label="Cerrar">×</button></header>
            <div className="mobile-more-grid">
              {moreItems.map((item) => <NavItem item={item} key={item.to} />)}
              <NavLink to="/support" className="nav-item"><Icon name="alert" /><span>Soporte</span></NavLink>
              <NavLink to="/settings" className="nav-item"><Icon name="settings" /><span>Configuración</span></NavLink>
              <button
                className="nav-item"
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  reliability.openSupport();
                }}
              >
                <Icon name="alert" /><span>Reportar un problema</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

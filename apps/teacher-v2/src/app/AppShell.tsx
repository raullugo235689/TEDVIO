import { hasPendingAcademicWork, useAcademicDraftGuard } from '../core/useAcademicDraft';
import { hasPendingGradebook, useGradebookDraftGuard } from '../core/useGradebookDraftGuard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { hasPendingAttendance, useAttendanceDraftGuard } from '../core/useAttendanceDraftGuard';
import { ActionDialog } from '../shared/ActionDialog';
import { useAuth } from '../features/auth/AuthProvider';
import { useReliability } from '../features/reliability/ReliabilityProvider';
import { isNavigationGroupActive, navigationArea, navigationAreaLabel, navigationGroups, navigationTitle, type NavigationGroup, type NavigationItem } from './navigation';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { Icon } from '../shared/icons';
import { prefetchTeacherRoute } from './route-loaders';
import { GroupWorkspace } from '../shared/GroupWorkspace';
import { useTeacherIdentity } from '../core/useTeacherIdentity';

import { ClassLauncher, useWorkflowContext, WorkflowSectionNavigation } from '../shared/WorkflowNavigation';
import { workflowLink, type WorkflowContext } from '../core/workflow-navigation';
import '../styles/product-workspace.css';
import { ReleaseNotice } from '../shared/ReleaseNotice';

const THEME_KEY = 'tedvio.teacher-v2.theme';

type Theme = 'light' | 'dark';

function NavItem({ item, mobile = false, groupActive = false, context }: { item: NavigationItem; mobile?: boolean; groupActive?: boolean; context?: WorkflowContext }) {
  const to = context ? workflowLink(item.to, context) : item.to;
  return (
    <NavLink
      to={to}
      aria-current={groupActive ? 'page' : undefined}
      end={item.to === '/'}
      data-area={navigationArea(item.to)}
      className={({ isActive }) => `nav-item${isActive || groupActive ? ' active' : ''}${mobile ? ' mobile' : ''}`}
      onPointerEnter={() => prefetchTeacherRoute(to)}
      onFocus={() => prefetchTeacherRoute(to)}
      onTouchStart={() => prefetchTeacherRoute(to)}
    >
      <Icon name={item.icon} />
      <span>{mobile ? item.shortLabel : item.label}</span>
    </NavLink>
  );
}

function SidebarGroup({ group, pathname, context }: { group: NavigationGroup; pathname: string; context: WorkflowContext }) {
  const active = isNavigationGroupActive(group, pathname);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); }, [pathname]);
  const id = `nav-tools-${group.to.replace('/', '') || 'home'}`;
  return <div className="workspace-nav-group" data-area={navigationArea(group.to)}>
    <div className="workspace-nav-heading">
      <NavItem item={group} context={context} groupActive={active} />
      {group.children.length ? <button className="nav-expand" type="button" aria-label={`Herramientas de ${group.label}`} aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}><Icon name="arrow" /></button> : null}
    </div>
    {group.children.length ? <div className="workspace-subnav" id={id} hidden={!expanded}>{group.children.map((item) => <NavItem item={item} context={context} key={item.to} />)}</div> : null}
  </div>;
}

function MobileTools({ onDismiss, onSupport, context }: { onDismiss: () => void; onSupport: () => void; context: WorkflowContext }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const needle = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX').trim();
  const matches = (item: NavigationItem) => !needle || `${item.label} ${item.shortLabel} ${(item.keywords || []).join(' ')}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX').includes(needle);
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); trigger?.focus({ preventScroll: true }); };
  }, []);
  return <dialog className="workspace-tools-dialog" ref={ref} aria-labelledby="workspace-tools-title" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onDismiss(); } }} onCancel={(event) => { event.preventDefault(); onDismiss(); }}>
    <header><div><span className="eyebrow">TU ESPACIO DOCENTE</span><h2 id="workspace-tools-title">Todas las herramientas</h2></div><button type="button" className="icon-button" onClick={onDismiss} aria-label="Cerrar herramientas">×</button></header>
    <label className="product-tools-search"><Icon name="search" /><input type="search" autoFocus aria-label="Buscar herramienta" placeholder="Buscar: faltas, examen, alumnos…" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <nav aria-label="Todas las herramientas" onClick={(event) => { if ((event.target as HTMLElement).closest('a')) onDismiss(); }}>
      {navigationGroups.map(group => {
        const items = [group, ...group.children].filter(matches);
        return items.length ? <section className="workspace-tools-section" data-area={navigationArea(group.to)} key={group.to}><h3>{group.label}</h3><div>{items.map(item => <NavItem item={item} context={context} key={item.to} />)}</div></section> : null;
      })}
      {needle && !navigationGroups.some(group => [group, ...group.children].some(matches)) ? <p className="product-tools-empty" role="status">No encontramos esa herramienta. Prueba con asistencia, preguntas o calificaciones.</p> : null}
      <div className="workspace-tools-footer"><NavLink to="/settings" data-area="settings" className="nav-item"><Icon name="settings" /><span>Cuenta y configuración</span></NavLink><span className="product-personal-label">FORMACIÓN PERSONAL · SEPARADA DE TUS GRUPOS</span><NavLink to="/enarm-2027" data-area="enarm" className="nav-item enarm2027-access"><Icon name="exam"/><span>ENARM 2027 · Mi preparación</span></NavLink><NavLink to="/support" data-area="settings" className="nav-item"><Icon name="alert" /><span>Ayuda y soporte</span></NavLink><button className="button secondary" type="button" onClick={onSupport}>Reportar un problema</button></div>
    </nav>
  </dialog>;
}

export function AppShell() {
  const auth = useAuth();
  const identity = useTeacherIdentity();
  const queryClient = useQueryClient();
  useAttendanceDraftGuard(auth.user?.id);
  useAcademicDraftGuard(auth.user?.id);
  const omrSaving = useIsMutating({ mutationKey: ['omr-write', auth.user?.id] }) > 0;
  const examSaving = useIsMutating({ mutationKey: ['exam-write', auth.user?.id] }) > 0;
  useGradebookDraftGuard(auth.user?.id);
  const gradebookSaving = useIsMutating({ mutationKey: ['gradebook-write', auth.user?.id] }) > 0;
  const attendanceSaving = useIsMutating({ mutationKey: ['attendance-write', auth.user?.id] }) > 0;
  const [confirmLogout, setConfirmLogout] = useState(false);
  const reliability = useReliability();
  const location = useLocation();
  const groupTab = location.pathname.startsWith('/groups/') ? new URLSearchParams(location.search).get('tab') : null;
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
      window.scrollTo(0, 0);
      document.getElementById('tedvio-main')?.focus({ preventScroll: true });
    });
  }, [location.pathname, groupTab]);

  const routeTitle = useMemo(() => navigationTitle(location.pathname), [location.pathname]);
  const area = navigationArea(location.pathname);
  const mobileItems = navigationGroups;
  const context = useWorkflowContext();
  const inClass = /^\/classroom\/[^/]+/.test(location.pathname);
  const connectionLabel = reliability.syncing
    ? 'Sincronizando'
    : reliability.online
      ? reliability.pendingCount
        ? `${reliability.pendingCount} pendiente(s)`
        : 'En línea'
      : 'Sin conexión';
  const connectionTone = reliability.syncing ? 'syncing' : reliability.online ? (reliability.pendingCount ? 'pending' : 'online') : 'offline';

  async function logout(confirmed = false) {
    if (!confirmed && (hasPendingAttendance(queryClient, auth.user?.id) || hasPendingGradebook(queryClient, auth.user?.id) || hasPendingAcademicWork(queryClient, auth.user?.id))) {
      setConfirmLogout(true);
      return;
    }
    if (attendanceSaving || gradebookSaving || omrSaving || examSaving) return;
    setSigningOut(true);
    try {
      await auth.signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="app-shell teacher42-shell product-shell" data-area={area}>
      <a className="workspace-skip-link" href="#tedvio-main" onClick={(event) => { event.preventDefault(); document.getElementById('tedvio-main')?.focus(); }}>Saltar al contenido</a>
      <aside className="sidebar" aria-label="Navegación principal">
        <Link className="sidebar-brand" to="/" aria-label="TEDVIO Hoy">
          <img src="/assets/tedvio_official_horizontal.svg" alt="TEDVIO" />
        </Link>

        <ClassLauncher className="product-sidebar-class" />
        <nav className="sidebar-nav">
          <div className="nav-section-label">TU ESPACIO DOCENTE</div>
          {navigationGroups.map((group) => <SidebarGroup group={group} context={context} pathname={location.pathname} key={group.to} />)}
        </nav>

        <div className="sidebar-bottom">
          <NavLink to="/settings" data-area="settings" className="nav-item"><Icon name="settings" /><span>Cuenta y configuración</span></NavLink>
          <NavLink to="/enarm-2027" data-area="enarm" className={({ isActive }) => `nav-item enarm2027-access${isActive?' active':''}`}>
            <Icon name="exam"/><span>ENARM 2027<small>Mi preparación médica</small></span>
          </NavLink>
          <NavLink to="/support" data-area="settings" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <Icon name="alert" /><span>Ayuda y soporte</span>
          </NavLink>
          <div className="rebuild-badge teacher42-trust"><Icon name="shield" /><span><b>TEDVIO TEACHER</b><small>Espacio docente protegido</small></span></div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar teacher42-topbar">
          <div className="topbar-title">
            <span>{area === 'enarm' ? 'FORMACIÓN PERSONAL' : 'ESPACIO DOCENTE'} <span aria-hidden="true">/</span> {navigationAreaLabel[area]}</span>
            <p className="workspace-route-title">{area==='enarm'?'ENARM 2027':routeTitle}</p>
          </div>
          <div className="topbar-actions">
            <div className={`reliability-pill ${connectionTone}`} role="status" aria-live="polite" title={connectionLabel}>
              <i />
              <span>{connectionLabel}</span>
            </div>
            <button
              className="icon-button product-tools-toggle"
              type="button"
              onClick={() => setMoreOpen(value => !value)}
              aria-label="Más"
              title="Todas las herramientas"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
            >
              <Icon name="menu" />
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
            <Link className="user-chip" to="/settings" aria-label={`Perfil de ${identity.displayName}`} title={identity.displayName}>
              <span aria-hidden="true">{identity.initials}</span>
              <div><b>{identity.displayName}</b><small>{auth.user?.email || ''}</small></div>
            </Link>
            <button className="icon-button" type="button" onClick={() => void logout()} disabled={signingOut} aria-label="Cerrar sesión" title="Cerrar sesión">
              <Icon name="logout" />
            </button>
          </div>
        </header>

        <ReleaseNotice />
        <main className="route-container teacher42-main" id="tedvio-main" tabIndex={-1}>
          <RouteErrorBoundary resetKey={location.pathname}>
            {!inClass && !/\/(?:print|sheets)$/.test(location.pathname) && location.pathname !== '/' ? <div className="product-mobile-class"><ClassLauncher /></div> : null}
            <GroupWorkspace><WorkflowSectionNavigation /><Outlet /></GroupWorkspace>
          </RouteErrorBoundary>
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Navegación móvil">
        {mobileItems.map((item) => <NavItem item={item} mobile context={context} groupActive={isNavigationGroupActive(item, location.pathname)} key={item.to} />)}
      </nav>

      {moreOpen ? <MobileTools context={context} onDismiss={() => setMoreOpen(false)} onSupport={() => { setMoreOpen(false); reliability.openSupport(); }} /> : null}
      {confirmLogout ? <ActionDialog eyebrow="TEDVIO · CUENTA" title={hasPendingAcademicWork(queryClient, auth.user?.id) ? '¿Salir con trabajo pendiente?' : hasPendingGradebook(queryClient, auth.user?.id) ? '¿Salir con calificaciones pendientes?' : '¿Salir con asistencia pendiente?'}
        detail="Hay trabajo académico sin guardar en esta pestaña. Al cerrar sesión se descartará; puedes cancelar y volver a guardarlo."
        confirmLabel="Salir sin guardar" danger busy={signingOut || attendanceSaving || gradebookSaving || omrSaving || examSaving}
        onDismiss={() => setConfirmLogout(false)} onConfirm={() => void logout(true)} /> : null}
    </div>
  );
}

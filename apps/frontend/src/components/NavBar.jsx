import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext.jsx';
import { LANGUAGES, useI18n } from '../lib/i18n.js';

const navFor = (role, t) => ({
  admin: [['/admin', t('Issues')], ['/map', t('Map')], ['/insights', t('Insights')], ['/admin/qr', t('QR tags')], ['/admin/people', t('People')], ['/emergency', t('Emergency')], ['/security', t('Security')]],
  staff: [['/admin', t('My assignments')], ['/map', t('Map')], ['/emergency', t('Emergency')], ['/security', t('Security')]],
  student: [['/report', t('Report issue')], ['/mine', t('My complaints')], ['/feed', t('Campus feed')], ['/map', t('Map')], ['/emergency', t('Emergency')], ['/security', t('Security')]],
})[role];

export default function NavBar({ unread }) {
  const { t, language, setLanguage } = useI18n();
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const links = user ? navFor(user.role, t) : [];
  // Highlight the most specific matching link only (/admin/qr should not also light up /admin).
  const active = links.map(([path]) => path).filter((p) => pathname === p || pathname.startsWith(`${p}/`)).sort((a, b) => b.length - a.length)[0];
  const bellLabel = unread > 0 ? t('Notifications ({n} new)', { n: unread }) : t('Notifications');

  return (
    <div className="menubar no-print">
      <nav id="nav" aria-label={t('Main')}>
        {links.map(([path, text]) => <Link key={path} to={path} aria-current={path === active ? 'page' : undefined}>{text}</Link>)}
        {user && (
          <Link to="/notifications" className="bell" aria-label={bellLabel} aria-current={pathname === '/notifications' ? 'page' : undefined}>
            <span aria-hidden="true">🔔</span>
            <span className="bell-count" hidden={unread === 0}>{unread > 99 ? '99+' : unread}</span>
          </Link>
        )}
        {user && <span className="who">{`${user.name} (${t(user.role)})`}</span>}
        <select className={`lang${user ? '' : ' push'}`} aria-label={t('Language')} value={language} onChange={(e) => setLanguage(e.target.value)}>
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        {user && <button type="button" onClick={async () => { await signOut(); navigate('/login'); }}>{t('Sign out')}</button>}
      </nav>
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import Footer from '../components/Footer.jsx';
import Header from '../components/Header.jsx';
import NavBar from '../components/NavBar.jsx';
import { useUnread } from '../hooks/useUnread.js';
import { useI18n } from '../lib/i18n.js';
import { useAuth } from './AuthContext.jsx';

const BASE_TITLE = 'UniSeva Portal';

// The frame around every page: header, menu, the page itself, footer.
export default function Layout() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { unread } = useUnread(user);
  const main = useRef(null);

  // The count is also dropped when signed out, so it never lingers in the tab title.
  useEffect(() => { document.title = unread > 0 ? `(${unread}) ${BASE_TITLE}` : BASE_TITLE; }, [unread]);
  useEffect(() => { main.current?.focus({ preventScroll: true }); }, [pathname]);

  // Accounts without a security question could not reset a forgotten password, so say so.
  const needsQuestion = user && user.role !== 'admin' && !user.security_set && pathname !== '/security';

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); main.current?.focus(); }}>{t('Skip to content')}</a>
      <Header />
      <NavBar unread={unread} />
      <main id="main" tabIndex={-1} ref={main}>
        {needsQuestion && (
          <div className="notice">
            <strong>{t('Protect your account. ')}</strong>{t('Set a security question so you can reset your password if you forget it. ')}<Link to="/security">{t('Set it now')}</Link>
          </div>
        )}
        <Outlet />
      </main>
      <Footer />
    </>
  );
}

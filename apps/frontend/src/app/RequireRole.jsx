import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useI18n } from '../lib/i18n.js';
import { homeFor, useAuth } from './AuthContext.jsx';

const NEXT_KEY = 'campusfix.next';

// A QR scan while signed out must survive the sign-in step.
export const rememberNext = (path) => { try { sessionStorage.setItem(NEXT_KEY, path); } catch { /* storage unavailable */ } };
export function takeNext() {
  try {
    const next = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    return next && next !== '/login' ? next : null;
  } catch { return null; }
}

// Lets the page through only for the listed roles; everyone else is sent to the sign-in page or their own home.
export default function RequireRole({ roles }) {
  const { t } = useI18n();
  const { user, booting } = useAuth();
  const location = useLocation();

  if (booting) return <p className="muted">{t('Loading...')}</p>;
  if (!user) {
    rememberNext(location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return <Outlet />;
}

// The sign-in pages: a signed-in visitor goes straight to their home.
export function PublicOnly() {
  const { t } = useI18n();
  const { user, booting } = useAuth();
  if (booting) return <p className="muted">{t('Loading...')}</p>;
  if (user) return <Navigate to={homeFor(user)} replace />;
  return <Outlet />;
}

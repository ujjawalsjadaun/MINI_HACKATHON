import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from '../lib/api.js';
import { useToast } from './ToastContext.jsx';
import { useI18n } from '../lib/i18n.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export const homeFor = (user) => (user.role === 'student' ? '/report' : '/admin');

// Who is signed in. On load the stored token is checked with the server; until then `booting` is true.
export function AuthProvider({ children }) {
  const { t } = useI18n();
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(Boolean(tokenStore.get()));

  useEffect(() => {
    if (!tokenStore.get()) return;
    api('/me').then(setUser).catch(() => tokenStore.set(null)).finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    const expired = () => {
      tokenStore.set(null);
      setUser(null);
      toast(t('Your session expired. Please sign in again.'), 'error');
    };
    window.addEventListener('auth:expired', expired);
    return () => window.removeEventListener('auth:expired', expired);
  }, [toast, t]);

  const signIn = useCallback(({ token, user: next }) => { tokenStore.set(token); setUser(next); }, []);
  const signOut = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* the token may already be invalid */ }
    tokenStore.set(null);
    setUser(null);
  }, []);
  const patchUser = useCallback((changes) => setUser((u) => (u ? { ...u, ...changes } : u)), []);

  const value = useMemo(() => ({ user, booting, signIn, signOut, patchUser }), [user, booting, signIn, signOut, patchUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

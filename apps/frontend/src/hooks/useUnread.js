import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// The bell's unread count: fetched now, whenever something changes, and every minute while the page is open.
export function useUnread(user) {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) { setUnread(0); return; }
    try { setUnread((await api('/notifications/unread-count')).unread); } catch { /* a missed poll changes nothing */ }
  }, [user]);

  useEffect(() => {
    refresh();
    const poll = setInterval(() => { if (!document.hidden) refresh(); }, 60_000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    window.addEventListener('notifications:changed', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(poll);
      window.removeEventListener('notifications:changed', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return { unread, refresh };
}

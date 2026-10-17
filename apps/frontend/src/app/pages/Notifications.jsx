import { useNavigate } from 'react-router-dom';
import { issuePath } from '../../components/IssueCard.jsx';
import { Async, EmptyState } from '../../components/ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { api } from '../../lib/api.js';
import { formatDate } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.js';
import { useAuth } from '../AuthContext.jsx';
import { useToast } from '../ToastContext.jsx';

// Each kind of notification is a sentence with the details filled in. The wording is translated here,
// so people read it in their own language even though the server only stored the kind and details.
const SENTENCES = {
  acknowledged: (t, p) => t('The team has seen your report "{title}". Acknowledged by {name}.', p),
  assigned: (t, p) => t('"{title}" has been assigned to {name}.', p),
  in_progress: (t, p) => t('Work has started on "{title}".', p),
  needs_confirmation: (t, p) => t('The team says "{title}" is fixed. Please confirm it, or reopen it.', p),
  note: (t, p) => t('The team posted an update on "{title}".', p),
  assigned_you: (t, p) => t('"{title}" was assigned to you.', p),
  reopened: (t, p) => t('A reporter says "{title}" is not fixed.', p),
  resolved: (t, p) => t('"{title}" was confirmed as fixed.', p),
  new_emergency: (t, p) => t('Emergency report at {place}: "{title}".', p),
};

export default function Notifications() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const state = useAsync(() => api('/notifications'), []);

  async function markAll() {
    try {
      await api('/notifications/read', { method: 'POST', body: {} });
      window.dispatchEvent(new Event('notifications:changed'));
      state.reload();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function open(n) {
    if (!n.read) { try { await api('/notifications/read', { method: 'POST', body: { ids: [n.id] } }); } catch { /* opening the issue matters more */ } }
    window.dispatchEvent(new Event('notifications:changed'));
    navigate(issuePath(user.role, n.issue_id));
  }

  return (
    <Async state={state}>
      {({ items, unread }) => (
        <section>
          <div className="row between">
            <h1>{t('Notifications')}</h1>
            {unread > 0 && <button className="secondary" type="button" onClick={markAll}>{t('Mark all as read')}</button>}
          </div>
          {items.length
            ? items.map((n) => (
              <div key={n.id} className={`card notification${n.read ? '' : ' unread'}`}>
                <div className="row between">
                  <div>
                    <p style={{ margin: 0 }}>
                      {!n.read && <span className="dot" aria-hidden="true" />}
                      {!n.read && <span className="sr-only">{t('New')}</span>}
                      {(SENTENCES[n.kind] ?? (() => ''))(t, n.params)}
                    </p>
                    {n.params.note && <p className="hint" style={{ margin: '.25rem 0 0' }}>{`"${n.params.note}"`}</p>}
                    <p className="hint" style={{ margin: '.25rem 0 0' }}>{formatDate(n.created_at, locale)}</p>
                  </div>
                  <button className="secondary" type="button" onClick={() => open(n)}>{t('Open')}</button>
                </div>
              </div>
            ))
            : <EmptyState title={t('Nothing new')} text={t('You will see updates about your reports and your work here.')} />}
        </section>
      )}
    </Async>
  );
}

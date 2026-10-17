import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../app/ToastContext.jsx';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';

// What is already open at the chosen place, so the student can join an existing issue ("Me too")
// instead of filing a duplicate.
export default function SimilarIssues({ matches }) {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState(null);

  async function meToo(id) {
    setBusyId(id);
    try {
      await api(`/issues/${id}/me-too`, { method: 'POST' });
      toast(t('Confirmed. Thanks, this helps prioritise the fix.'));
      navigate('/mine');
    } catch (err) {
      toast(err.message, 'error');
      setBusyId(null);
    }
  }

  return (
    <div aria-live="polite">
      {matches.length > 0 && (
        <div className="notice">
          <strong>{t('Already reported here. Is this yours?')}</strong>
          <p className="hint">{t('Tap "Me too" to join an existing issue instead of filing a duplicate. You will follow its progress under My complaints, and it moves up the queue.')}</p>
          <ul>
            {matches.map((x) => (
              <li key={x.id}>
                <strong>{x.title}</strong>{x.detail ? ` (${x.detail})` : ''}{` - ${t(x.report_count === 1 ? 'reported by {n} person' : 'reported by {n} people', { n: x.report_count })} `}
                {x.likely && <span className="badge count">{t('likely match')}</span>}{' '}
                <button type="button" className="secondary" disabled={busyId === x.id} onClick={() => meToo(x.id)}>{t('Me too, this is mine')}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

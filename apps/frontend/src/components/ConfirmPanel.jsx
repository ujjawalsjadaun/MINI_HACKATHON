import { useState } from 'react';
import { useToast } from '../app/ToastContext.jsx';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';

// The team says it is fixed: a reporter confirms it (which closes the issue) or reopens it.
export default function ConfirmPanel({ id, onDone }) {
  const { t } = useI18n();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function act(path, body, message) {
    setBusy(true);
    try {
      await api(`/issues/${id}/${path}`, { method: 'POST', body });
      toast(message);
      onDone();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  return (
    <div className="notice">
      <strong>{t('The team says this is fixed. Is it?')}</strong>
      <p className="hint">{t('The issue only closes when a reporter confirms the fix actually happened.')}</p>
      <label htmlFor="reopen-note">{t('Note')}</label>
      <textarea id="reopen-note" maxLength={300} placeholder={t('If it is not fixed, tell us what is still wrong (optional)')} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="row" style={{ marginTop: '.75rem' }}>
        <button className="primary" type="button" disabled={busy} onClick={() => act('confirm', undefined, t('Thanks. Marked as resolved.'))}>{t('Yes, it is fixed')}</button>
        <button className="secondary" type="button" disabled={busy} onClick={() => act('reopen', { note }, t('Reopened. The team has been notified.'))}>{t('No, reopen it')}</button>
      </div>
    </div>
  );
}

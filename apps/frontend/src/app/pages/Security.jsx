import { useState } from 'react';
import { Async } from '../../components/ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { api, getMeta } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.js';
import { useAuth } from '../AuthContext.jsx';
import { useToast } from '../ToastContext.jsx';

// Change your own password (everyone).
function PasswordCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.next !== form.again) { setError(t('The two new passwords do not match.')); document.getElementById('pw-again')?.focus(); return; }
    setBusy(true);
    try {
      await api('/me/password', { method: 'PUT', body: { current: form.current, password: form.next } });
      toast(t('Password changed. Your other devices have been signed out.'));
      setForm({ current: '', next: '', again: '' });
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h2>{t('Change your password')}</h2>
      <form onSubmit={submit}>
        <label htmlFor="pw-current">{t('Your current password')}</label>
        <input id="pw-current" type="password" required autoComplete="current-password" value={form.current} onChange={set('current')} />
        <label htmlFor="pw-new">{t('New password')}</label>
        <input id="pw-new" type="password" required minLength={user.role === 'student' ? 6 : 8} maxLength={100} autoComplete="new-password" value={form.next} onChange={set('next')} />
        <p className="hint">{t(user.role === 'student' ? 'At least 6 characters.' : 'At least 8 characters.')}</p>
        <label htmlFor="pw-again">{t('New password again')}</label>
        <input id="pw-again" type="password" required autoComplete="new-password" value={form.again} onChange={set('again')} />
        <p className="error" role="alert">{error}</p>
        <div className="row" style={{ marginTop: '1rem' }}><button className="primary" type="submit" disabled={busy}>{t('Change password')}</button></div>
      </form>
    </div>
  );
}

// Set or change the question used to reset a forgotten password (students and staff; an admin's password
// can only be reset by another admin).
function QuestionCard({ questions }) {
  const { t } = useI18n();
  const { user, patchUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ question: '', answer: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/me/security-question', { method: 'PUT', body: form });
      patchUser({ security_set: true });
      toast(t('Security question saved.'));
      setForm({ question: '', answer: '', password: '' });
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h2>{t('Security question')}</h2>
      <p className="muted">{user.security_set ? t('You have a security question. Saving a new one replaces it.') : t('You have not set one yet. Without it you cannot reset a forgotten password.')}</p>
      <form onSubmit={submit}>
        <label htmlFor="sec-q">{t('Question')}</label>
        <select id="sec-q" required value={form.question} onChange={set('question')}>
          <option value="">{t('Choose a question')}</option>
          {questions.map((q) => <option key={q} value={q}>{t(q)}</option>)}
        </select>
        <label htmlFor="sec-a">{t('Your answer')}</label>
        <input id="sec-a" required minLength={3} maxLength={60} autoComplete="off" value={form.answer} onChange={set('answer')} />
        <p className="hint">{t('Not case-sensitive. Choose something only you know.')}</p>
        <label htmlFor="sec-pw">{t('Your current password (to confirm it is you)')}</label>
        <input id="sec-pw" type="password" required autoComplete="current-password" value={form.password} onChange={set('password')} />
        <p className="error" role="alert">{error}</p>
        <div className="row" style={{ marginTop: '1rem' }}><button className="primary" type="submit" disabled={busy}>{t('Save security question')}</button></div>
      </form>
    </div>
  );
}

export default function Security() {
  const { t } = useI18n();
  const { user } = useAuth();
  const state = useAsync(getMeta, []);
  return (
    <section>
      <h1>{t('Security')}</h1>
      <PasswordCard />
      {user.role !== 'admin' && <Async state={state}>{(meta) => <QuestionCard questions={meta.securityQuestions} />}</Async>}
    </section>
  );
}

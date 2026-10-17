import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import InstituteEmailField, { WRONG_DOMAIN, isInstituteEmail } from '../../components/InstituteEmailField.jsx';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.js';
import { useToast } from '../ToastContext.jsx';

// Reset without email: answer the security question chosen at registration.
export default function Forgot() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const emailRef = useRef(null);
  const [email, setEmail] = useState('');
  const [askError, setAskError] = useState('');
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function ask(e) {
    e.preventDefault();
    setAskError('');
    if (!isInstituteEmail(email)) { setAskError(t(WRONG_DOMAIN)); emailRef.current?.focus(); return; }
    try {
      setQuestion((await api(`/auth/security-question?email=${encodeURIComponent(email)}`)).question);
    } catch (err) { setAskError(err.message); }
  }

  async function reset(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { email, answer, password } });
      toast(t('Password changed. Sign in with your new password.'));
      navigate('/login');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <div className="card">
        <h1>{t('Forgot your password?')}</h1>
        <p className="muted">{t('Answer the security question you chose when you registered.')}</p>
        <form onSubmit={ask}>
          <label htmlFor="ask-email">{t('Your account email')}</label>
          <InstituteEmailField id="ask-email" value={email} inputRef={emailRef} onChange={setEmail} />
          <p className="error" role="alert">{askError}</p>
          <div className="row" style={{ marginTop: '1rem' }}><button className="primary" type="submit">{t('Show my question')}</button></div>
        </form>
        <div aria-live="polite">
          {question && (
            <form onSubmit={reset}>
              <div className="notice"><strong>{t(question)}</strong></div>
              <label htmlFor="reset-answer">{t('Your answer')}</label>
              <input id="reset-answer" autoComplete="off" required maxLength={100} autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} />
              <label htmlFor="new-password">{t('New password')}</label>
              <input id="new-password" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="hint">{t('At least 6 characters. You will be signed out on all devices. Admin accounts cannot be reset this way.')}</p>
              <p className="error" role="alert">{error}</p>
              <div className="row" style={{ marginTop: '1rem' }}><button className="primary" type="submit" disabled={busy}>{t('Set new password')}</button></div>
            </form>
          )}
        </div>
      </div>
      <p><Link to="/login">{t('< Back to sign in')}</Link></p>
    </div>
  );
}

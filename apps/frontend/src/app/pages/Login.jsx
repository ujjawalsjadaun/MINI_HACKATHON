import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import InstituteEmailField, { WRONG_DOMAIN, isInstituteEmail } from '../../components/InstituteEmailField.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { api, getMeta } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.js';
import { homeFor, useAuth } from '../AuthContext.jsx';
import { takeNext } from '../RequireRole.jsx';

function SignInCard() {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '', question: '', answer: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [questions, setQuestions] = useState([]);
  const emailRef = useRef(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // The security questions are only needed when registering.
  useEffect(() => { if (!isLogin) getMeta().then((m) => setQuestions(m.securityQuestions)).catch(() => {}); }, [isLogin]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!isInstituteEmail(form.email)) { setError(t(WRONG_DOMAIN)); emailRef.current?.focus(); return; }
    setBusy(true);
    try {
      const body = isLogin
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password, securityQuestion: form.question, securityAnswer: form.answer };
      const result = await api(isLogin ? '/auth/login' : '/auth/register', { method: 'POST', body });
      signIn(result);
      navigate(takeNext() ?? homeFor(result.user), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="card narrow">
      <h1>{t(isLogin ? 'Sign in to UniSeva Portal' : 'Create your account')}</h1>
      <p className="muted">{t('Report broken lights, Wi-Fi, leaks and more. Track every complaint until it is fixed.')}</p>
      <form onSubmit={submit}>
        {!isLogin && (
          <>
            <label htmlFor="name">{t('Full name')}</label>
            <input id="name" autoComplete="name" required minLength={2} value={form.name} onChange={set('name')} />
          </>
        )}
        <label htmlFor="email">{t('Email')}</label>
        <InstituteEmailField id="email" value={form.email} inputRef={emailRef} onChange={(email) => setForm((f) => ({ ...f, email }))} />
        <label htmlFor="password">{t('Password')}</label>
        <input id="password" type="password" required minLength={isLogin ? 1 : 6} autoComplete={isLogin ? 'current-password' : 'new-password'} value={form.password} onChange={set('password')} />
        {!isLogin && <p className="hint">{t('At least 6 characters.')}</p>}
        {!isLogin && (
          <>
            <label htmlFor="sec-q">{t('Security question (used if you forget your password)')}</label>
            {/* The option value stays English because that is what the server checks; only the shown text is translated. */}
            <select id="sec-q" required value={form.question} onChange={set('question')}>
              <option value="">{t('Choose a question')}</option>
              {questions.map((q) => <option key={q} value={q}>{t(q)}</option>)}
            </select>
            <label htmlFor="sec-a">{t('Your answer')}</label>
            <input id="sec-a" required minLength={3} maxLength={60} autoComplete="off" value={form.answer} onChange={set('answer')} />
            <p className="hint">{t('Not case-sensitive. Choose something only you know.')}</p>
          </>
        )}
        {isLogin && <p className="hint"><Link to="/forgot">{t('Forgot your password?')}</Link></p>}
        <p className="error" role="alert">{error}</p>
        <div className="row" style={{ marginTop: '1rem' }}>
          <button className="primary" type="submit" disabled={busy}>{t(isLogin ? 'Sign in' : 'Create account')}</button>
          <button className="secondary" type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }}>
            {t(isLogin ? 'New here? Register' : 'Have an account? Sign in')}
          </button>
        </div>
      </form>
    </div>
  );
}

// Facts and live notices from the host institute's official site (the backend's institute service lists the sources).
function AboutPanel() {
  const { t } = useI18n();
  const state = useAsync(() => api('/institute'), []);
  const info = state.data;
  if (!info) return null; // the panel is a bonus: the sign-in form works without it
  return (
    <aside className="card about" aria-label={t('About the institute')}>
      <h2>{t('About {name}', { name: info.short })}</h2>
      <p>{t(info.status)}. {t(info.established)}.</p>
      <p className="muted">{t(info.campus)}</p>
      <h3>{t('Vision')}</h3><p>{t(info.vision)}</p>
      <h3>{t('Mission')}</h3>
      <ul>{info.mission.map((m) => <li key={m}>{t(m)}</li>)}</ul>
      {info.notices.length > 0 && (
        <>
          <h3>{t('Latest notices from the institute')}</h3>
          <ul className="notices">
            {info.notices.map((n) => (
              <li key={n.url}>
                <a href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a>
                {n.date && <span className="hint">{` - ${n.date}`}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="hint">{`${info.address}. ${t('Phone {phone}.', { phone: info.phone })}`}</p>
      <p className="hint">
        {t('Source: ')}
        {info.sources.map((s, i) => <span key={s.url}>{i > 0 && ', '}<a href={s.url} target="_blank" rel="noopener noreferrer">{t(s.label)}</a></span>)}
        {t(' (retrieved {date}). UniSeva Portal is a student project, not an official service of the institute.', { date: info.retrieved })}
      </p>
    </aside>
  );
}

export default function Login() {
  return (
    <div className="auth-wrap">
      <SignInCard />
      <AboutPanel />
    </div>
  );
}

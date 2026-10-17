import { useState } from 'react';
import { Async, EmptyState } from '../../components/ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.js';
import { useAuth } from '../AuthContext.jsx';
import { useToast } from '../ToastContext.jsx';

function DepartmentSelect({ id, departments, value, onChange }) {
  const { t } = useI18n();
  return (
    <select id={id} value={value} onChange={onChange}>
      {departments.map((d) => <option key={d} value={d}>{t(d)}</option>)}
    </select>
  );
}

// ---- add a person
function AddPerson({ departments, onAdded }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', role: 'staff', department: departments[0], password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/people', { method: 'POST', body: form });
      toast(t('Account created. Give them the password and ask them to keep it private.'));
      setForm({ name: '', email: '', role: 'staff', department: departments[0], password: '' });
      setBusy(false);
      onAdded();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>{t('Add a staff member or admin')}</h2>
      <form onSubmit={submit}>
        <div className="filters">
          <div><label htmlFor="p-name">{t('Full name')}</label><input id="p-name" required minLength={2} maxLength={80} autoComplete="off" value={form.name} onChange={set('name')} /></div>
          <div><label htmlFor="p-email">{t('Email')}</label><input id="p-email" type="email" required autoComplete="off" placeholder="name@nitap.ac.in" value={form.email} onChange={set('email')} /></div>
        </div>
        <div className="filters">
          <div>
            <label htmlFor="p-role">{t('Role')}</label>
            <select id="p-role" value={form.role} onChange={set('role')}>
              <option value="staff">{t('Staff')}</option>
              <option value="admin">{t('Admin')}</option>
            </select>
          </div>
          <div hidden={form.role === 'admin'}>
            <label htmlFor="p-department">{t('Department')}</label>
            <DepartmentSelect id="p-department" departments={departments} value={form.department} onChange={set('department')} />
          </div>
          <div><label htmlFor="p-password">{t('Starting password')}</label><input id="p-password" type="password" required minLength={8} maxLength={100} autoComplete="new-password" value={form.password} onChange={set('password')} /></div>
        </div>
        <p className="hint">{t('At least 8 characters. Share it in person or by phone, not in a group chat.')}</p>
        <p className="error" role="alert">{error}</p>
        <div className="row" style={{ marginTop: '.75rem' }}><button className="primary" type="submit" disabled={busy}>{t('Add person')}</button></div>
      </form>
    </div>
  );
}

// ---- one card per person
function PersonCard({ person: p, departments, onChanged }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const isMe = p.id === user.id;

  async function patch(body, message) {
    try {
      await api(`/people/${p.id}`, { method: 'PATCH', body });
      toast(message);
      setResetting(false);
      setNewPassword('');
      onChanged();
    } catch (err) { toast(err.message, 'error'); }
  }

  function toggleActive() {
    if (p.active && !window.confirm(t('Deactivate {name}? They are signed out at once and their open issues go back to the queue.', { name: p.name }))) return;
    patch({ active: !p.active }, t(p.active ? '{name} has been deactivated.' : '{name} can sign in again.', { name: p.name }));
  }

  return (
    <div className={`card${p.active ? '' : ' inactive'}`}>
      <div className="row between">
        <div>
          <strong>{p.name}</strong> {isMe && <span className="hint">{t('(you)')}</span>}
          <div className="hint">{p.email}</div>
        </div>
        <div className="row">
          <span className="badge count">{t(p.role)}</span>
          <span className={`badge ${p.active ? 'low' : 'critical'}`}>{t(p.active ? 'Active' : 'Deactivated')}</span>
        </div>
      </div>
      {p.role === 'staff' && (
        <div className="row" style={{ marginTop: '.5rem' }}>
          <label htmlFor={`dept-${p.id}`} style={{ margin: 0 }}>{t('Department')}</label>
          <DepartmentSelect id={`dept-${p.id}`} departments={departments} value={p.department} onChange={(e) => patch({ department: e.target.value }, t('Department updated.'))} />
          <span className="hint">{t(p.open_issues === 1 ? '{n} open issue' : '{n} open issues', { n: p.open_issues })}</span>
        </div>
      )}
      <div className="row" style={{ marginTop: '.75rem' }}>
        <button className="secondary" type="button" onClick={() => setResetting(!resetting)}>{t('Reset password')}</button>
        {!isMe && <button className="secondary" type="button" onClick={toggleActive}>{t(p.active ? 'Deactivate' : 'Reactivate')}</button>}
      </div>
      {resetting && (
        <div className="row" style={{ marginTop: '.5rem' }}>
          <input type="password" minLength={8} maxLength={100} autoComplete="new-password" aria-label={t('New password')} autoFocus value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <button className="primary" type="button" onClick={() => patch({ password: newPassword }, t('Password changed. {name} has been signed out everywhere.', { name: p.name }))}>{t('Set password')}</button>
        </div>
      )}
    </div>
  );
}

// Admin only: the team behind the queue. Accounts are created here instead of by a script.
export default function People() {
  const { t } = useI18n();
  const state = useAsync(() => api('/people'), []);
  return (
    <Async state={state}>
      {({ people, students, departments }) => (
        <section>
          <h1>{t('People')}</h1>
          <p className="muted">{t(students === 1 ? 'The team behind the queue. {n} student has registered.' : 'The team behind the queue. {n} students have registered.', { n: students })}</p>
          <AddPerson departments={departments} onAdded={state.reload} />
          {people.length
            ? people.map((p) => <PersonCard key={p.id} person={p} departments={departments} onChanged={state.reload} />)
            : <EmptyState title={t('No team members yet')} text={t('Add the first staff member above.')} />}
        </section>
      )}
    </Async>
  );
}

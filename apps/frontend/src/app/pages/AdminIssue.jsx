import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ContactList from '../../components/ContactList.jsx';
import FeedbackCard from '../../components/FeedbackCard.jsx';
import IssueCard from '../../components/IssueCard.jsx';
import Timeline from '../../components/Timeline.jsx';
import WhereCard from '../../components/WhereCard.jsx';
import { Async, Badge } from '../../components/ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { api, getEmergency, getMeta } from '../../lib/api.js';
import { categoryLabel, contactsWith, helpTags, isHostelPlace, noteText, priorityReason } from '../../lib/describe.js';
import { formatDate } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.js';
import { useAuth } from '../AuthContext.jsx';
import { useToast } from '../ToastContext.jsx';

// Teams cannot close an issue themselves: only a reporter's confirmation resolves it.
function UpdateForm({ issue, meta, staff, isAdmin, onSaved }) {
  const { t } = useI18n();
  const toast = useToast();
  const currentAssignee = staff.find((s) => s.name === issue.assigned_to)?.id ?? null;
  const [status, setStatus] = useState(issue.status);
  const [assignee, setAssignee] = useState(currentAssignee == null ? '' : String(currentAssignee));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Admins assign to a named staff member (own department first); staff see who it is assigned to.
  const byDept = [...staff].sort((a, b) => (b.department === issue.department) - (a.department === issue.department));
  const statusText = { awaiting_confirmation: t('Fixed - ask reporters to confirm') };

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = { status, note };
      if (status === issue.status) delete body.status;
      const next = assignee === '' ? null : Number(assignee);
      if (isAdmin && next !== currentAssignee) body.assignee_id = next;
      await api(`/issues/${issue.id}`, { method: 'PATCH', body });
      toast(t('Issue updated. Students can see the new status.'));
      setNote('');
      setBusy(false);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="status">{t('Status')}</label>
      <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
        {meta.statuses.filter((s) => s !== 'resolved' || issue.status === 'resolved').map((s) => <option key={s} value={s}>{statusText[s] ?? t(s.replace(/_/g, ' '))}</option>)}
      </select>
      <label htmlFor="assignee">{t('Assigned to')}</label>
      {isAdmin
        ? (
          <select id="assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">{t('Unassigned')}</option>
            {byDept.map((s) => <option key={s.id} value={s.id}>{`${s.name} (${t(s.department)})`}</option>)}
          </select>
        )
        : <p>{issue.assigned_to ?? t('Unassigned')}</p>}
      <label htmlFor="note">{t('Note (optional)')}</label>
      <textarea id="note" maxLength={300} placeholder={t('Visible to students on the progress timeline')} value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="error" role="alert">{error}</p>
      <div className="row" style={{ marginTop: '1rem' }}><button className="primary" type="submit" disabled={busy}>{t('Save update')}</button></div>
    </form>
  );
}

function AcknowledgePanel({ id, onDone }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function acknowledge() {
    setBusy(true);
    try {
      await api(`/issues/${id}/acknowledge`, { method: 'POST' });
      toast(t('Acknowledged. Reporters can see that the team has seen it.'));
      setBusy(false);
      onDone();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }
  return (
    <div className="notice">
      <strong>{t('Not acknowledged yet')}</strong>
      <p className="hint">{t('Let the reporters know the team has seen this, even before work starts.')}</p>
      <button className="primary" type="button" disabled={busy} onClick={acknowledge}>{t('Acknowledge this issue')}</button>
    </div>
  );
}

// The team's view of one issue: update it, assign it, acknowledge it, and see every grouped report.
export default function AdminIssue() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const state = useAsync(async () => {
    const [meta, detail, staff, directory] = await Promise.all([getMeta(), api(`/issues/${id}`), isAdmin ? api('/staff') : [], getEmergency()]);
    return { meta, detail, staff, directory };
  }, [id]);

  return (
    <Async state={state}>
      {({ meta, detail, staff, directory }) => {
        const { issue, reports, log } = detail;
        // Useful numbers for this issue: the engineering cell for building faults, the hostel office for hostel problems,
        // and the emergency contacts when it is critical.
        const contacts = contactsWith(directory, helpTags({ category: issue.category, hostel: isHostelPlace(meta, issue.location), emergency: issue.priority.label === 'critical' && issue.status !== 'resolved' }));
        return (
          <section>
            <p><Link to="/admin">{t('< Back to queue')}</Link></p>
            <IssueCard issue={issue} meta={meta} />
            <WhereCard meta={meta} issue={issue} />
            {contacts.length > 0 && issue.status !== 'resolved' && (
              <div className="card"><h2>{t('Useful contacts for this issue')}</h2><ContactList entries={contacts} /></div>
            )}
            {!issue.acknowledged_at && issue.status !== 'resolved' && <AcknowledgePanel id={issue.id} onDone={state.reload} />}
            <div className="card">
              <h2>{t('Why this priority')}</h2>
              <p>{t('Score {score}: {reasons}.', { score: issue.priority.score, reasons: issue.priority.reasons.map(priorityReason).join(', ') })}</p>
              <p className={issue.sla.overdue ? 'error' : 'muted'}>
                {issue.sla.overdue
                  ? t('Overdue by {n} hours (deadline for this category: {hours}h).', { n: issue.sla.overdue_hours, hours: issue.sla.hours })
                  : t('Deadline for this category: {hours}h from the report.', { hours: issue.sla.hours })}
              </p>
              <p className="muted">{t('{category} issues are routed to {dept}.', { category: categoryLabel(meta, issue.category), dept: t(issue.department) })}</p>
            </div>
            <div className="grid">
              <div className="card"><h2>{t('Update')}</h2><UpdateForm key={`${issue.status}-${issue.assigned_to}-${issue.updated_at}`} issue={issue} meta={meta} staff={staff} isAdmin={isAdmin} onSaved={state.reload} /></div>
              <div className="card"><h2>{t('Progress')}</h2><Timeline log={log} /></div>
            </div>
            {(issue.status === 'resolved' || detail.feedback.count > 0) && <FeedbackCard feedback={detail.feedback} />}
            <div className="card reports">
              <h2>{t(reports.length === 1 ? '{n} report grouped into this issue' : '{n} reports grouped into this issue', { n: reports.length })}</h2>
              {reports.map((r, i) => (
                <div key={i} style={{ borderTop: '1px solid var(--border)', padding: '.75rem 0' }}>
                  <strong>{r.reporter ?? t('Student')}</strong> <span className="hint">{formatDate(r.created_at, locale)}</span>
                  <p>{noteText(r.description)}</p>
                  {r.match_reason && <p className="hint">{t('Auto-grouped: {reason}', { reason: noteText(r.match_reason) })}</p>}
                  {r.photo && <a href={r.photo} target="_blank" rel="noopener noreferrer"><img className="photo" src={r.photo} alt={t('Photo from {name}', { name: r.reporter ?? t('a student') })} /></a>}
                </div>
              ))}
            </div>
            {issue.reopen_count > 0 && <p className="hint">{t(issue.reopen_count === 1 ? 'Reopened {n} time after a claimed fix.' : 'Reopened {n} times after a claimed fix.', { n: issue.reopen_count })}</p>}
            {issue.status === 'resolved' && <Badge text="resolved" className="status-resolved" />}
          </section>
        );
      }}
    </Async>
  );
}

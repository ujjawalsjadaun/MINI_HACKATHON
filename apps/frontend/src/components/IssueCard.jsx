import { Link } from 'react-router-dom';
import { useAuth } from '../app/AuthContext.jsx';
import { useI18n } from '../lib/i18n.js';
import { formatDate } from '../lib/format.js';
import { categoryLabel } from '../lib/describe.js';
import { Badge, Stars } from './ui/index.js';

export const issuePath = (role, id) => (role === 'student' ? `/issue/${id}` : `/admin/issue/${id}`);

// One issue as a card: title, badges, where and when, with optional action area underneath.
export default function IssueCard({ issue, meta, children }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  return (
    <article className="card issue">
      <div className="row between">
        <h3><Link to={issuePath(user.role, issue.id)}>{issue.title}</Link></h3>
        <div className="row">
          {issue.sla.overdue && <Badge text="overdue" className="critical" />}
          <Badge text={issue.priority.label} className={issue.priority.label} />
          <Badge text={issue.status} className={`status-${issue.status}`} />
          {issue.status !== 'resolved' && (issue.acknowledged_at
            ? <span className="badge ack" title={t('Acknowledged by {name}', { name: issue.acknowledged_by })}>{t('acknowledged')}</span>
            : <span className="badge unack" title={t('The team has not confirmed it has seen this yet')}>{t('not yet acknowledged')}</span>)}
        </div>
      </div>
      <div className="meta">
        <span>{issue.location}{issue.detail ? ` - ${issue.detail}` : ''}</span>
        <span>{categoryLabel(meta, issue.category)}</span>
        <span className="badge count" title={t('Students who reported this problem')}>{t(issue.report_count === 1 ? '{n} report' : '{n} reports', { n: issue.report_count })}</span>
        {issue.feedback_count > 0 && (
          <span className="badge count" title={t('Average student rating of the fix')}><Stars value={issue.feedback_avg} /> {issue.feedback_avg} ({issue.feedback_count})</span>
        )}
        <span>{t('Reported {date}', { date: formatDate(issue.created_at, locale) })}</span>
        {issue.assigned_to && <span>{t('Assigned to {name}', { name: issue.assigned_to })}</span>}
        {issue.acknowledged_at && <span>{t('Acknowledged by {name}, {date}', { name: issue.acknowledged_by, date: formatDate(issue.acknowledged_at, locale) })}</span>}
      </div>
      {children}
    </article>
  );
}

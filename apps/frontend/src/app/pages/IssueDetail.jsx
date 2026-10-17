import { Link, useParams } from 'react-router-dom';
import ConfirmPanel from '../../components/ConfirmPanel.jsx';
import FeedbackPanel from '../../components/FeedbackPanel.jsx';
import IssueCard from '../../components/IssueCard.jsx';
import Timeline from '../../components/Timeline.jsx';
import WhereCard from '../../components/WhereCard.jsx';
import { Async, Badge } from '../../components/ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { api, getMeta } from '../../lib/api.js';
import { noteText, priorityReason } from '../../lib/describe.js';
import { formatDate } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.js';

// A student's view of one issue: progress, priority, their own report, and the confirm / rate prompts.
export default function IssueDetail() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const state = useAsync(async () => {
    const [meta, detail] = await Promise.all([getMeta(), api(`/issues/${id}`)]);
    return { meta, detail };
  }, [id]);

  return (
    <Async state={state}>
      {({ meta, detail }) => {
        const { issue, reports, log } = detail;
        return (
          <section>
            <p><Link to="/mine">{t('< Back to my complaints')}</Link></p>
            <IssueCard issue={issue} meta={meta} />
            <WhereCard meta={meta} issue={issue} />
            <FeedbackPanel key={issue.id} detail={detail} onDone={state.reload} />
            <div className="card">
              <h2>{t('Why this priority')}</h2>
              <p>{t('{label}, score {score}: {reasons}.', { label: t(issue.priority.label), score: issue.priority.score, reasons: issue.priority.reasons.map(priorityReason).join(', ') })}</p>
              <p className={issue.sla.overdue ? 'error' : 'muted'}>
                {issue.sla.overdue
                  ? (issue.sla.overdue_hours > 0
                    ? t('The team has passed its {hours}h deadline for this kind of problem by {n} hours.', { hours: issue.sla.hours, n: issue.sla.overdue_hours })
                    : t('The team has passed its {hours}h deadline for this kind of problem.', { hours: issue.sla.hours }))
                  : t("The team's deadline for this kind of problem is {hours} hours from the report.", { hours: issue.sla.hours })}
              </p>
            </div>
            {issue.acknowledged_at && issue.status !== 'resolved' && (
              <div className="notice ok">
                <strong>{t('The team has seen your report. ')}</strong>{t('Acknowledged by {name} on {date}.', { name: issue.acknowledged_by, date: formatDate(issue.acknowledged_at, locale) })}
              </div>
            )}
            <div className="card">
              <h2>{t('Progress')}</h2>
              <Timeline log={log} />
            </div>
            {reports.length > 0 && (
              <div className="card reports">
                <h2>{t('Your report')}</h2>
                {reports.map((r, i) => (
                  <div key={i}>
                    <p>{noteText(r.description)}</p>
                    {r.match_reason && <p className="hint">{t('Grouped with an existing issue: {reason}', { reason: noteText(r.match_reason) })}</p>}
                    {r.photo && <img className="photo" src={r.photo} alt={t('Photo you attached to this report')} />}
                    <p className="hint">{formatDate(r.created_at, locale)}</p>
                  </div>
                ))}
              </div>
            )}
            {detail.can_confirm && <ConfirmPanel id={issue.id} onDone={state.reload} />}
            {issue.status === 'resolved' && <div className="notice ok"><Badge text="resolved" className="status-resolved" />{t(' This issue has been resolved.')}</div>}
          </section>
        );
      }}
    </Async>
  );
}

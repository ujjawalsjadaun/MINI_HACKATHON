import { Link } from 'react-router-dom';
import { Async, EmptyState, Stars } from '../../components/ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { api } from '../../lib/api.js';
import { formatDate } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.js';

const Tile = ({ value, text, hint }) => (
  <div className="card">
    <div className="stat">{value}</div>
    <div>{text}</div>
    {hint && <div className="hint">{hint}</div>}
  </div>
);

function Bars({ title, rows, name, value, note }) {
  const { t } = useI18n();
  const max = Math.max(1, ...rows.map(value));
  return (
    <div className="card">
      <h2>{title}</h2>
      {rows.length ? (
        <div className="bars">
          {rows.map((row, i) => (
            <div className="bar" key={i}>
              <span title={name(row)}>{name(row)}</span>
              <div className="track" role="img" aria-label={`${name(row)}: ${value(row)}`}><div className="fill" style={{ width: `${(value(row) / max) * 100}%` }} /></div>
              <strong>{value(row)}</strong>
            </div>
          ))}
        </div>
      ) : <p className="muted">{note ?? t('No data yet.')}</p>}
    </div>
  );
}

// Admin dashboard: where problems cluster, what keeps coming back, what is stuck, and how fixes were rated.
export default function Insights() {
  const { t, locale } = useI18n();
  const state = useAsync(() => api('/insights'), []);
  return (
    <Async state={state}>
      {(d) => {
        const totals = d.totals;
        if (!totals.issues) return <EmptyState title={t('No insights yet')} text={t('Insights appear once students start reporting issues.')} />;
        return (
          <section>
            <h1>{t('Campus insights')}</h1>
            <div className="grid">
              <Tile value={totals.active} text={t('Active issues')} hint={t('{resolved} resolved of {total}', { resolved: totals.resolved, total: totals.issues })} />
              <Tile value={totals.reports} text={t('Student reports')} hint={t('grouped into {n} underlying issues', { n: totals.issues })} />
              <Tile value={totals.overdue} text={t('Overdue')} hint={t('past their category deadline')} />
              <Tile value={totals.duplicates_merged} text={t('Duplicates merged')} hint={t('complaints the team no longer triages twice')} />
              <Tile value={totals.reopened_issues} text={t('Reopened')} hint={t(totals.reopens === 1 ? 'claimed fixes that did not hold ({n} reopening)' : 'claimed fixes that did not hold ({n} reopenings)', { n: totals.reopens })} />
              <Tile value={totals.avg_resolution_hours == null ? '-' : `${totals.avg_resolution_hours}h`} text={t('Avg. time to resolve')} hint={t('across resolved issues')} />
              <Tile value={totals.avg_rating == null ? '-' : `${totals.avg_rating} / 5`} text={t('Fix rating')} hint={totals.rated ? t(totals.rated === 1 ? 'average of {n} student rating' : 'average of {n} student ratings', { n: totals.rated }) : t('No ratings yet')} />
            </div>

            {d.overdue.length > 0 && (
              <div className="card">
                <h2>{t('Overdue issues')}</h2>
                <p className="muted">{t('Past the deadline for their category, so their priority has been raised.')}</p>
                <ul>
                  {d.overdue.map((i) => (
                    <li key={i.id}><Link to={`/admin/issue/${i.id}`}>{i.title}</Link>{t(' - {place}, overdue by {n}h (deadline {hours}h)', { place: i.location, n: i.sla.overdue_hours, hours: i.sla.hours })}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="card">
              <h2>{t('Recurring problems')}</h2>
              <p className="muted">{t('The same kind of fault at the same place {min}+ times in {days} days. These point to a root cause, not a one-off repair.', { min: d.recurring_rule.min, days: d.recurring_rule.days })}</p>
              {d.recurring.length
                ? (
                  <ul>
                    {d.recurring.map((r) => (
                      <li key={`${r.category}-${r.location}`}><strong>{t('{label} at {place}', { label: t(r.label), place: r.location })}</strong>{t(' - {n} separate issues in {days} days, last on {date}', { n: r.occurrences, days: d.recurring_rule.days, date: formatDate(r.last_seen, locale) })}</li>
                    ))}
                  </ul>
                )
                : <p className="muted">{t('No recurring problems detected yet.')}</p>}
            </div>

            <div className="card">
              <h2>{t('Stuck for more than {days} days', { days: d.stale.after_days })}</h2>
              {d.stale.issues.length
                ? (
                  <ul>
                    {d.stale.issues.map((i) => (
                      <li key={i.id}><Link to={`/admin/issue/${i.id}`}>{i.title}</Link>{t(' - {place}, {status} since {date}', { place: i.location, status: t(i.status.replace(/_/g, ' ')), date: formatDate(i.created_at, locale) })}</li>
                    ))}
                  </ul>
                )
                : <p className="muted">{t('Nothing is overdue.')}</p>}
            </div>

            {d.feedback.low.length > 0 && (
              <div className="card">
                <h2>{t('Lowest ratings')}</h2>
                <p className="muted">{t('Fixes rated 1 or 2 stars, with what students wrote.')}</p>
                <ul>
                  {d.feedback.low.map((f, i) => (
                    <li key={i}><Link to={`/admin/issue/${f.id}`}>{f.title}</Link>{` - ${f.location} `}<Stars value={f.rating} />{f.comment && ` ${f.comment}`}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid">
              <Bars title={t('Issues by location (hotspots)')} rows={d.hotspots} name={(r) => r.location} value={(r) => r.issues} />
              <Bars title={t('Avg. hours to resolve, by category')} rows={d.resolution_by_category} name={(r) => t(r.label)} value={(r) => r.avg_hours} note={t('Appears once issues are resolved.')} />
              <Bars title={t('Issues by category')} rows={d.by_category} name={(r) => t(r.label)} value={(r) => r.count} />
              <Bars title={t('Active workload by team')} rows={d.by_department} name={(r) => t(r.department)} value={(r) => r.active ?? 0} />
              <Bars title={t('Average rating by category')} rows={d.feedback.by_category} name={(r) => t(r.label)} value={(r) => r.average} note={t('Appears once students rate fixes.')} />
              <Bars title={t('Issues by status')} rows={d.by_status} name={(r) => t(r.status.replace(/_/g, ' '))} value={(r) => r.count} />
            </div>
          </section>
        );
      }}
    </Async>
  );
}

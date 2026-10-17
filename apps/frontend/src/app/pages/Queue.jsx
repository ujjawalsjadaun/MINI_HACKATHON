import { useSearchParams } from 'react-router-dom';
import IssueCard from '../../components/IssueCard.jsx';
import { Async, EmptyState } from '../../components/ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { api, getMeta } from '../../lib/api.js';
import { priorityReason } from '../../lib/describe.js';
import { useI18n } from '../../lib/i18n.js';
import { useAuth } from '../AuthContext.jsx';

// The queue of issues, most urgent first. Staff only see what is assigned to them. Filters live in the address,
// so a filtered queue can be bookmarked or shared.
export default function Queue() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const filters = { status: params.get('status') ?? 'active', category: params.get('category') ?? '', location: params.get('location') ?? '' };
  const isStaff = user.role === 'staff';

  const state = useAsync(async () => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    const [meta, issues] = await Promise.all([getMeta(), api(`/issues?${query}`)]);
    return { meta, issues };
  }, [filters.status, filters.category, filters.location]);

  const change = (key) => (e) => {
    const next = { ...filters, [key]: e.target.value };
    // An empty status means "All", so it has to stay in the address to be told apart from the default.
    setParams(new URLSearchParams(Object.entries(next).filter(([k, v]) => v || k === 'status')));
  };

  return (
    <Async state={state}>
      {({ meta, issues }) => {
        const critical = issues.filter((i) => i.priority.label === 'critical').length;
        return (
          <section>
            <div className="row between">
              <h1>{t(isStaff ? 'My assigned issues' : 'Issue queue')}</h1>
              <p className="muted">{`${t(issues.length === 1 ? '{n} issue' : '{n} issues', { n: issues.length })}${critical ? t(', {n} critical', { n: critical }) : ''}${t(' - most urgent first')}`}</p>
            </div>
            <div className="filters">
              <div>
                <label htmlFor="f-status">{t('Status')}</label>
                <select id="f-status" value={filters.status} onChange={change('status')}>
                  <option value="active">{t('Active (not resolved)')}</option>
                  <option value="">{t('All')}</option>
                  {meta.statuses.map((s) => <option key={s} value={s}>{t(s.replace(/_/g, ' '))}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="f-category">{t('Category')}</label>
                <select id="f-category" value={filters.category} onChange={change('category')}>
                  <option value="">{t('All categories')}</option>
                  {meta.categories.map((c) => <option key={c.key} value={c.key}>{t(c.label)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="f-location">{t('Location')}</label>
                <select id="f-location" value={filters.location} onChange={change('location')}>
                  <option value="">{t('All locations')}</option>
                  {meta.locations.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            {issues.length
              ? issues.map((issue) => (
                <IssueCard key={issue.id} issue={issue} meta={meta}>
                  <p className="hint">{`${t('Routed to {dept}. Priority {score}: {reasons}.', { dept: t(issue.department), score: issue.priority.score, reasons: issue.priority.reasons.map(priorityReason).join(', ') })}${issue.sla.overdue ? ` ${t('Overdue by {n}h (deadline {hours}h).', { n: issue.sla.overdue_hours, hours: issue.sla.hours })}` : ''}`}</p>
                </IssueCard>
              ))
              : <EmptyState title={t('No issues match')} text={t('Try a different filter.')} />}
          </section>
        );
      }}
    </Async>
  );
}

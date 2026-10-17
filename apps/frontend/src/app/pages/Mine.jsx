import IssueCard from '../../components/IssueCard.jsx';
import RatingAction from '../../components/RatingAction.jsx';
import { Async, EmptyState } from '../../components/ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { api, getMeta } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.js';

export default function Mine() {
  const { t } = useI18n();
  const state = useAsync(async () => {
    const [meta, issues] = await Promise.all([getMeta(), api('/issues?mine=1')]);
    return { meta, issues };
  }, []);
  return (
    <Async state={state}>
      {({ meta, issues }) => (
        <section>
          <h1>{t('My complaints')}</h1>
          <p className="muted">{t('Every problem you reported or confirmed, with its latest status.')}</p>
          {issues.length
            ? issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} meta={meta}>
                {issue.status === 'resolved' && <RatingAction issue={issue} />}
              </IssueCard>
            ))
            : <EmptyState title={t('Nothing reported yet')} text={t('When you report a campus issue it will show up here with live status.')} link={{ to: '/report', text: t('Report an issue') }} />}
        </section>
      )}
    </Async>
  );
}

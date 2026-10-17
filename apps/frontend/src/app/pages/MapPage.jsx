import CampusMap, { PRIORITY_COLOR, issuePins } from '../../components/CampusMap.jsx';
import { Async, EmptyState } from '../../components/ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { api, getMeta } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.js';
import { useAuth } from '../AuthContext.jsx';

// Every open problem on the campus map, coloured by priority. Staff only see what is assigned to them.
export default function MapPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const state = useAsync(async () => {
    const [meta, issues] = await Promise.all([getMeta(), api('/issues?status=active')]);
    return { meta, issues };
  }, []);
  const hrefOf = (issue) => `#/${user.role === 'student' ? '' : 'admin/'}issue/${issue.id}`;

  return (
    <Async state={state}>
      {({ meta, issues }) => {
        const count = (label) => issues.filter((i) => i.priority.label === label).length;
        const exact = issues.filter((i) => i.pin_x != null).length;
        return (
          <section>
            <h1>{t('Problem map')}</h1>
            <p className="muted">{t('Open problems on the campus. Tap a pin to open it. The map is a drawing, not to scale.')}</p>
            {issues.length ? (
              <>
                <div className="legend">
                  {Object.entries(PRIORITY_COLOR).map(([label, color]) => (
                    <span className="legend-item" key={label}><i style={{ background: color }} />{`${t(label)} (${count(label)})`}</span>
                  ))}
                </div>
                <div className="card"><div className="map-wrap"><CampusMap meta={meta} label={t('Map of open problems on the campus')} pins={issuePins(meta, issues, hrefOf, t)} /></div></div>
                <p className="hint">{`${t(issues.length === 1 ? '{n} open problem.' : '{n} open problems.', { n: issues.length })} ${t('{exact} marked at an exact spot; faded pins show a problem whose exact spot was not marked, placed inside its building.', { exact })}`}</p>
              </>
            ) : <EmptyState title={t('Nothing to show')} text={t('There are no open problems right now.')} />}
          </section>
        );
      }}
    </Async>
  );
}
